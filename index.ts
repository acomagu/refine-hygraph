import {
  CrudFilters,
  CrudSorting,
  DataProvider,
  LogicalFilter,
  BaseRecord,
} from "@refinedev/core";
import { GraphQLClient } from "graphql-request";
import * as gql from "gql-query-builder";
import { singular } from "pluralize";
import { camelCase, pascalCase, capitalCase } from 'change-case';

const genereteSort = (sorters?: CrudSorting) => {
  const sorter = sorters?.[0];
  if (!sorter) return null;

  return `${pascalCase(sorter.field)}_${capitalCase(sorter.order)}`
};

const generateFilter = (filters?: CrudFilters) => {
  const queryFilters: { [key: string]: any } = {};

  if (filters) {
    filters.map((filter) => {
      if (
        filter.operator !== "or" &&
        filter.operator !== "and" &&
        "field" in filter
      ) {
        const { field, operator, value } = filter;

        if (operator === "eq") {
          queryFilters[`${field}`] = value;
        } else {
          queryFilters[`${field}_${operator}`] = value;
        }
      } else {
        const value = filter.value as LogicalFilter[];

        const orFilters: any[] = [];
        value.map((val) => {
          orFilters.push({
            [`${val.field}_${val.operator}`]: val.value,
          });
        });

        queryFilters["_or"] = orFilters;
      }
    });
  }

  return queryFilters;
};

function debug<Args extends unknown[], Ret>(name: string, f: (...args: Args) => Promise<Ret>) {
  return async (...args: Args) => {
    const ret = await f(...args);
    console.log(name, ret);
    return ret;
  };
}

export class HygraphDataProvider implements DataProvider {
  constructor(private readonly client: GraphQLClient) {
    this.getList = debug('getList', this.getList.bind(this));
    this.create = debug('create', this.create.bind(this));
    this.custom = debug('custom', this.custom.bind(this));
    this.getOne = debug('getOne', this.getOne.bind(this));
    this.update = debug('update', this.update.bind(this));
    this.getMany = debug('getMany', this.getMany.bind(this));
    this.deleteOne = debug('deleteOne', this.deleteOne.bind(this));
    this.getApiUrl = this.getApiUrl.bind(this);
    this.createMany = debug('createMany', this.createMany.bind(this));
  }
  async getList({ resource, pagination, sorters, filters, meta }: Parameters<DataProvider['getList']>[0]) {
    const {
      current = 1,
      pageSize = 10,
      mode = "server",
    } = pagination ?? {};

    const operation = `${camelCase(resource)}Connection`;
    const { query, variables } = gql.query([
      {
        operation,
        variables: {
          ...meta?.variables,
          orderBy: { value: genereteSort(sorters), type: `${pascalCase(singular(resource))}OrderByInput` },
          where: { value: generateFilter(filters), type: `${pascalCase(singular(resource))}WhereInput` },
          ...(mode === "server"
            ? {
              skip: (current - 1) * pageSize,
              first: pageSize,
            }
            : {}),
        },
        fields: [{
          aggregate: ["count"],
          edges: [{
            node: meta?.fields,
          }],
        }],
      },
    ]);

    const response = await this.client.request<BaseRecord>(query, variables);

    return {
      data: response[operation].edges.map((edge: { node: unknown }) => edge.node),
      total: response[operation].aggregate.count,
    };
  }

  async getMany({ resource, ids, meta }: Parameters<NonNullable<DataProvider['getMany']>>[0]) {
    const operation = camelCase(resource);

    const { query, variables } = gql.query({
      operation,
      variables: {
        where: {
          value: { id_in: ids },
          type: `${pascalCase(singular(resource))}WhereInput`,
        },
      },
      fields: meta?.fields,
    });

    const response = await this.client.request<any>(query, variables);

    return {
      data: response[operation],
    };
  }

  async create({ resource, variables, meta }: Parameters<NonNullable<DataProvider['create']>>[0]) {
    const operation = camelCase(`create-${singular(resource)}`);
    const { query, variables: gqlVariables } = gql.mutation({
      operation,
      variables: {
        data: {
          value: variables,
          type: `${pascalCase(singular(resource))}CreateInput!`,
        },
      },
      fields: meta?.fields ?? [
        {
          operation: singular(resource),
          fields: ["id"],
          variables: {},
        },
      ],
    });
    const response = await this.client.request<BaseRecord>(
      query,
      gqlVariables,
    );

    return {
      data: response[operation][singular(resource)],
    };
  }

  async createMany({ resource, variables, meta }: Parameters<NonNullable<DataProvider['createMany']>>[0]) {
    const singularResource = singular(resource);
    const camelCreateName = camelCase(`create-${singularResource}`);

    const operation = meta?.operation ?? camelCreateName;

    const response = await Promise.all(
      variables.map(async (param) => {
        const { query, variables: gqlVariables } = gql.mutation({
          operation,
          variables: {
            input: {
              value: { data: param },
              type: `${camelCreateName}Input`,
            },
          },
          fields: meta?.fields ?? [
            {
              operation: singularResource,
              fields: ["id"],
              variables: {},
            },
          ],
        });
        const result = await this.client.request<BaseRecord>(
          query,
          gqlVariables,
        );

        return result[operation][singularResource];
      }),
    );
    return {
      data: response,
    };
  }

  async update({ resource, id, variables, meta }: Parameters<NonNullable<DataProvider['update']>>[0]) {
    const operation = camelCase(`update-${singular(resource)}`);
    const { query, variables: gqlVariables } = gql.mutation({
      operation,
      variables: {
        where: {
          value: { id },
          type: `${pascalCase(singular(resource))}WhereUniqueInput!`,
        },
        data: {
          value: Object.fromEntries(Object.entries(variables as {}).filter(([key]) => key !== 'id')),
          type: `${pascalCase(singular(resource))}UpdateInput!`,
        },
      },
      fields: [
        {
          operation: singular(resource),
          fields: meta?.fields ?? ["id"],
          variables: {},
        },
      ],
    });
    const response = await this.client.request<BaseRecord>(
      query,
      gqlVariables,
    );

    return {
      data: response[operation][singular(resource)],
    };
  }

  async getOne({ resource, id, meta }: Parameters<NonNullable<DataProvider['getOne']>>[0]) {
    return { data: (await this.getMany({ resource, ids: [id], meta })).data[0] };
  }

  async deleteOne({ resource, id, meta }: Parameters<NonNullable<DataProvider['deleteOne']>>[0]) {
    const camelDeleteName = camelCase(`delete-${singular(resource)}`);

    const operation = meta?.operation ?? camelDeleteName;

    const { query, variables } = gql.mutation({
      operation,
      variables: {
        where: {
          value: { id },
          type: `${pascalCase(singular(resource))}WhereUniqueInput!`,
        },
      },
      fields: meta?.fields ?? [
        {
          operation: singular(resource),
          fields: ["id"],
          variables: {},
        },
      ],
    });

    const response = await this.client.request<BaseRecord>(query, variables);

    return {
      data: response[operation][singular(resource)],
    };
  }

  getApiUrl(): string {
    throw Error("Not implemented on refine-graphql data provider.");
  }

  async custom({ url, method, headers, meta }: Parameters<NonNullable<DataProvider['custom']>>[0]) {
    let gqlClient = this.client;

    if (url) {
      gqlClient = new GraphQLClient(url, { headers });
    }

    if (meta) {
      if (meta.operation) {
        if (method === "get") {
          const { query, variables } = gql.query({
            operation: meta.operation,
            fields: meta.fields,
            variables: meta.variables,
          });

          const response = await gqlClient.request<BaseRecord>(
            query,
            variables,
          );

          return {
            data: response[meta.operation],
          };
        } else {
          const { query, variables } = gql.mutation({
            operation: meta.operation,
            fields: meta.fields,
            variables: meta.variables,
          });

          const response = await gqlClient.request<BaseRecord>(
            query,
            variables,
          );

          return {
            data: response[meta.operation],
          };
        }
      } else {
        throw Error("GraphQL operation name required.");
      }
    } else {
      throw Error(
        "GraphQL need to operation, fields and variables values in meta object.",
      );
    }
  }
};
