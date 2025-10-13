export default {
  config: {
    locales: ["en"],
    menu: {
      logo: {
        en: { url: "/favicon.png", alt: "PromoAtlas PIM" },
      },
    },
  },
  bootstrap(app: any) {
    console.log("PromoAtlas Admin App initialized - Simple Version");

    // Add supplier sync management page
    app.addMenuLink({
      to: "/supplier-sync",
      icon: "refresh",
      intlLabel: {
        id: "supplier-sync.plugin.name",
        defaultMessage: "Supplier Sync",
      },
      Component: async () => {
        const mod = await import("./pages/supplier-sync.tsx");
        return mod.default;
      },
    });
  },
};
