/**
 * Product check routes (no auth)
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/check-a23-products',
      handler: 'api::supplier.supplier.checkA23Products',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};