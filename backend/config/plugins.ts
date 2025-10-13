export default ({ env }) => ({
  upload: {
    config: {
      provider: "strapi-provider-cloudflare-r2",
      providerOptions: {
        accessKeyId: env("R2_ACCESS_KEY_ID"),
        secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
        endpoint: env("R2_ENDPOINT"),
        accountId: env("R2_ACCOUNT_ID"),
        params: {
          Bucket: env("R2_BUCKET_NAME"),
        },
        publicUrl: env("R2_PUBLIC_URL"),
        cloudflarePublicAccessUrl: env("R2_PUBLIC_URL"),
        pool: true,
      },
    },
  },
});
