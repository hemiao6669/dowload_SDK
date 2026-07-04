# 91FLS 下载 SDK CDN 上传说明

这个目录可以直接发布到 GitHub 仓库，并通过 jsDelivr 访问。

## 目录内容

- CryptoJS 依赖改用 BootCDN，页面需要先引入它，全局变量为 `CryptoJS`
- `download-sdk/1.0.0/landing-download-sdk.min.js`：线上推荐使用的压缩版 SDK
- `download-sdk/1.0.0/landing-download-sdk.js`：未压缩可读版，方便调试

## 页面引用

当前发布仓库：`hemiao6669/dowload_SDK`

```html
<script src="https://cdn.bootcdn.net/ajax/libs/crypto-js/4.2.0/crypto-js.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/hemiao6669/dowload_SDK@v1.0.1/download-sdk/1.0.0/landing-download-sdk.min.js"></script>
<script>
  LandingDownloadSDK.init({
    apiDomainBootstrapUrls: [
      'https://example.com/domain.json'
    ],
    debug: false
  })

  document.querySelector('#download').onclick = function () {
    LandingDownloadSDK.download({
      inviteCode: 'ABC123'
    })
  }
</script>
```

## 缓存建议

- 后续 SDK 改动时新建版本目录，例如 `1.0.1`，不要覆盖旧版本
- 调试版 `landing-download-sdk.js` 不建议给正式页面长期使用
- jsDelivr 缓存较长，发布新版本时建议同时升级 Git tag，例如 `v1.0.1`

## API 选线返回格式

`apiDomainBootstrapUrls` 中的地址需要返回可解析的 API 域名。建议后端返回：

```json
{
  "apiBaseUrl": "https://api.example.com"
}
```

