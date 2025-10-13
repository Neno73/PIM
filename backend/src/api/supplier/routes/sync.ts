export default {
  routes: [
    {
      method: 'POST',
      path: '/suppliers/:id/sync',
      handler: 'supplier.syncSupplier',
      config: {
        policies: [],
        middlewares: [],
        auth: false, // Allow access without API token authentication
      },
    },
    {
      method: 'GET',
      path: '/suppliers/:id/sync-status',
      handler: 'supplier.getSyncStatus',
      config: {
        policies: [],
        middlewares: [],
        auth: false, // Allow access without API token authentication
      },
    },
  ],
};
