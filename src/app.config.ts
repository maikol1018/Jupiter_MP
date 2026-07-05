export default defineAppConfig({
  pages: [
    'pages/splash/index',
    'pages/input/index',
    'pages/main/index',
  ],
  subPackages: [
    {
      root: 'packageA',
      pages: [
        'pages/daily/index',
        'pages/consult/index',
        'pages/profile/index',
      ],
    },
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#1a0a2e',
    navigationBarTitleText: '木星小女巫',
    navigationBarTextStyle: 'white',
    backgroundColor: '#1a0a2e',
  },
  style: 'v2',
  sitemapLocation: 'sitemap.json',
  lazyCodeLoading: 'requiredComponents',
});
