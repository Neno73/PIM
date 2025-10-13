import pluginPkg from './package.json';

const name = pluginPkg.strapi.name;

export default {
  register(app) {
    app.addMenuLink({
      to: `/plugins/${name}`,
      icon: 'sync',
      intlLabel: {
        id: `${name}.plugin.name`,
        defaultMessage: 'Promidata Sync',
      },
      permissions: [
        {
          action: 'plugin::promidata-sync.read',
          subject: null,
        },
      ],
    });

    app.registerPlugin({
      id: name,
      initializer: () => import('./admin/src'),
      isReady: false,
      name,
    });
  },

  bootstrap() {},
};