# refine-hygraph

The [Refine](https://refine.dev) Data Provider for [Hygraph](https://hygraph.com) CMS.

## Installation

```
npm i @acomagu/refine-hygraph
```

## Example

```typescript
import { Refine } from '@refinedev/core';
import routerBindings from '@refinedev/react-router-v6';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HygraphDataProvider } from '@acomagu/refine-hygraph';

const client = new GraphQLClient(your_api_url, {
  headers: { authorization: `Bearer ${your_api_key}` },
});
const hygraphDataProvider = new HygraphDataProvider(client);

const inferencerPredefinedMeta = {
  'posts': {
    default: {
      fields: ['id', 'title', 'content'],
    },
  },
};

export default function App() {
  return (
    <BrowserRouter>
      ...
        <Refine
          dataProvider={{ default: hygraphDataProvider }}
          routerProvider={routerBindings}
          resources={[
            {
              name: 'posts',
              list: '/posts',
              create: '/posts/create',
              edit: '/posts/edit/:id',
              show: '/posts/show/:id',
            },
          ]}
        >
          <Routes>
            <Route path='posts'>
              <Route index element={<AntdInferencer meta={inferencerPredefinedMeta} />} />
              <Route
                path='show/:id'
                element={<AntdInferencer meta={inferencerPredefinedMeta} />}
              />
              <Route
                path='edit/:id'
                element={<AntdInferencer meta={inferencerPredefinedMeta} />}
              />
              <Route
                path='create'
                element={<AntdInferencer meta={inferencerPredefinedMeta} />}
              />
            </Route>
          </Routes>
        </Refine>
      ...
    </BrowserRouter>
  );
}
```
