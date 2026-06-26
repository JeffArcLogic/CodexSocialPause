import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  outDir: 'output',
  outDirTemplate: '{{browser}}-mv{{manifestVersion}}{{modeSuffix}}',
  manifest: {
    name: 'Codex Social Pause',
    description: 'Pauses social media while Codex is waiting or idle.',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApEmT7sarjb4G/mH5d1hocHQOSDC/uMKrrb+Uu0LavevShJQRVcBAoieQAFSZ7/XoU8kGXXanxSaQWHf7NHRVHOeCyw2ngc5IcFgF/Z8oYjoT1eUrk6ni4skyak0mEw9zs2gzAORkNwp26SpbMbRPDUsStZeGqjXYGFWx2uctfTNrla2NXRtYFwOfMc2aRYwJGnjVrC0qjctD6XIzeALaAEGj+SMLDe+Ll3wyNuQ8Xu2+5QVouwR6CS4mu27TBNPriqY/pYg2BqhEtknUugIjO5g8BXUu5EwG8KO3QaDFChbVRjVkDHvi0T5k0ilJC3g3WRme3x/HFDoFS5bI2DPhHQIDAQAB',
    permissions: ['nativeMessaging', 'storage'],
  },
});
