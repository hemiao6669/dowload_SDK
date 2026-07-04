/*
 * 91FLS 下载 SDK（未压缩可读版）
 *
 * 依赖：
 * - 需要先引入外部 CryptoJS SDK。
 *
 * 外部网页示例：
 *
 * <script src="https://cdn.jsdelivr.net/gh/hemiao6669/dowload_SDK@v1.0.0/vendor/crypto-js/4.2.0/crypto-js.min.js"></script>
 * <script src="https://cdn.jsdelivr.net/gh/hemiao6669/dowload_SDK@v1.0.0/download-sdk/1.0.0/landing-download-sdk.min.js"></script>
 * <script>
 *   LandingDownloadSDK.init({
 *     apiDomainBootstrapUrls: [
 *       'https://example.com/domain.json'
 *     ],
 *     debug: true
 *   })
 *
 *   document.querySelector('#download').onclick = function () {
 *     LandingDownloadSDK.downloadAndroid({
 *       inviteCode: 'ABC123'
 *     })
 *   }
 * </script>
 *
 */
;(function (window) {
  'use strict'

  const CryptoJS = window.CryptoJS
  if (!CryptoJS) {
    throw new Error('LandingDownloadSDK 缺少 CryptoJS，请先引入 crypto-js.min.js')
  }

  const GATEWAY_MAIN_PATH = '/a/main/request'
  const IOS_LANDING_PATH = '/fast-cloud/config/landing'
  const DEFAULT_TIMEOUT = 4500
  const DEFAULT_CACHE_KEY = 'landpage_sdk_api_base_url'
  const BIZ_SUCCESS_CODES = ['0000', '200']
  const GATEWAY_SECRET_KEYS = [
    'cmxykjj2nbqhhcca',
    'vthr644nu4w2qgbk',
    's31kkaadk3mp1qt8',
    'nqt7po9q8f4mzj8r',
    'ax1orz01wq5ph4ae',
    'rkor18h0nw98ptmi',
    'chkoczfcfjm2n822',
    '1xuorxwq3pvqcanx',
    'w1dyjl9714759yz9',
    'sbevm2x4sdacxcoz',
  ]

  let sdkOptions = {
    apiDomainBootstrapUrls: [],
    cacheKey: DEFAULT_CACHE_KEY,
    timeout: DEFAULT_TIMEOUT,
    debug: false,
  }

  let apiBaseUrl = ''
  let bootstrapPromise = null

  function debugLog() {
    if (!sdkOptions.debug) return
    const args = Array.prototype.slice.call(arguments)
    args.unshift('[LandingDownloadSDK]')
    console.log.apply(console, args)
  }

  function normalizeBase(url) {
    return String(url || '')
      .trim()
      .replace(/\/+$/, '')
  }

  function normalizeUrlList() {
    const urls = []
    const seen = {}
    Array.prototype.slice.call(arguments).forEach(function (item) {
      const list = Array.isArray(item) ? item : [item]
      list.forEach(function (raw) {
        const url = normalizeBase(raw)
        if (!url || seen[url]) return
        seen[url] = true
        urls.push(url)
      })
    })
    return urls
  }

  function pickGatewayKey(timestamp) {
    return GATEWAY_SECRET_KEYS[Number(timestamp % GATEWAY_SECRET_KEYS.length)]
  }

  function stringifyGatewayBody(body) {
    if (body === undefined || body === null) return ''
    if (typeof body === 'string') return body
    if (typeof body === 'number' || typeof body === 'boolean') return String(body)
    return JSON.stringify(body)
  }

  function buildEncryptedMainRequestBody(inner) {
    const time = Date.now()
    const key = CryptoJS.enc.Utf8.parse(pickGatewayKey(time))
    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(inner), key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    })
    return {
      time: time,
      data: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
    }
  }

  function toFiniteTime(value) {
    if (typeof value === 'number' && isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const n = Number(value)
      if (isFinite(n)) return n
    }
    return null
  }

  function parseEncryptedGatewayResponse(raw) {
    if (!raw || typeof raw !== 'object') return raw

    const encryptedData = raw.data
    if (typeof encryptedData !== 'string' || !encryptedData.trim()) return raw

    const time = toFiniteTime(raw.time)
    if (time === null) return raw

    const key = CryptoJS.enc.Utf8.parse(pickGatewayKey(time))
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(encryptedData.trim()),
    })
    const plain = CryptoJS.AES.decrypt(cipherParams, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString(CryptoJS.enc.Utf8)

    if (!plain.trim()) return ''

    try {
      return JSON.parse(plain)
    } catch (e) {
      return plain
    }
  }

  function fetchJson(url, init, timeout) {
    const controller = new AbortController()
    const timer = window.setTimeout(function () {
      controller.abort()
    }, timeout || sdkOptions.timeout)

    return fetch(url, Object.assign({}, init || {}, { signal: controller.signal }))
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.json()
      })
      .finally(function () {
        window.clearTimeout(timer)
      })
  }

  function readCachedBaseUrl() {
    try {
      return localStorage.getItem(sdkOptions.cacheKey) || ''
    } catch (e) {
      return ''
    }
  }

  function writeCachedBaseUrl(url) {
    try {
      if (url) localStorage.setItem(sdkOptions.cacheKey, url)
      else localStorage.removeItem(sdkOptions.cacheKey)
    } catch (e) {
      // 忽略隐私模式或存储禁用错误
    }
  }

  function parsePool(pool) {
    if (typeof pool !== 'string' || !pool.trim()) return []
    return normalizeUrlList.apply(null, pool.split(','))
  }

  function commitBaseUrl(url) {
    apiBaseUrl = normalizeBase(url)
    if (apiBaseUrl) writeCachedBaseUrl(apiBaseUrl)
  }

  function bootstrapApiDomain() {
    const cached = normalizeBase(readCachedBaseUrl())
    if (cached) {
      commitBaseUrl(cached)
      return Promise.resolve()
    }

    const urls = normalizeUrlList(sdkOptions.apiDomainBootstrapUrls)
    let chain = Promise.resolve(false)

    urls.forEach(function (url) {
      chain = chain.then(function (done) {
        if (done) return true
        return fetchJson(url, { method: 'GET' }, sdkOptions.timeout)
          .then(function (data) {
            if (!data || data.status !== 'success') return false
            const candidates = normalizeUrlList(data.result, parsePool(data.pool))
            if (!candidates.length) return false
            commitBaseUrl(candidates[0])
            return true
          })
          .catch(function (err) {
            debugLog('选线失败', url, err)
            return false
          })
      })
    })

    return chain.then(function (done) {
      if (!done) {
        apiBaseUrl = ''
        writeCachedBaseUrl('')
      }
    })
  }

  function ensureBootstrap() {
    if (!bootstrapPromise) bootstrapPromise = bootstrapApiDomain()
    return bootstrapPromise
  }

  function pickGatewayPayload(data) {
    if (data && typeof data === 'object') {
      if (data.data !== undefined && data.data !== null) return data.data
      if (data.result !== undefined && data.result !== null) return data.result
    }
    return data
  }

  function normalizeGatewayResponse(data) {
    if (data && typeof data === 'object' && 'code' in data) {
      return {
        code: data.code,
        data: pickGatewayPayload(data),
        msg: String(data.msg || data.message || ''),
        rawInner: data,
      }
    }
    return { code: 200, data: data, msg: 'success', rawInner: data }
  }

  function gatewayRequest(params) {
    return ensureBootstrap().then(function () {
      const base = normalizeBase(params.baseURL || apiBaseUrl)
      if (!base) throw new Error('API 线路未就绪')

      const inner = {
        uri: params.uri,
        method: params.method || 2,
        body: stringifyGatewayBody(params.body),
        params: params.params || {},
      }

      return fetchJson(
        base + GATEWAY_MAIN_PATH,
        {
          method: 'POST',
          body: JSON.stringify(buildEncryptedMainRequestBody(inner)),
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        },
        params.timeout || sdkOptions.timeout,
      ).then(function (raw) {
        const decrypted = parseEncryptedGatewayResponse(raw)
        debugLog('gateway', { inner: inner, raw: raw, decrypted: decrypted })
        return normalizeGatewayResponse(decrypted)
      })
    })
  }

  function readInviteCode(query) {
    let queryObject

    if (!query) {
      queryObject = Object.fromEntries(new URLSearchParams(window.location.search).entries())
    } else if (typeof query === 'string') {
      queryObject = Object.fromEntries(new URLSearchParams(query.replace(/^\?/, '')).entries())
    } else if (query instanceof URLSearchParams) {
      queryObject = Object.fromEntries(query.entries())
    } else {
      queryObject = query
    }

    const keys = ['code', 'inviteCode', 'dc', 'pc']
    for (let i = 0; i < keys.length; i++) {
      const raw = queryObject[keys[i]]
      const value = Array.isArray(raw) ? raw[0] : raw
      const code = String(value || '').trim()
      if (code) return code
    }
    return ''
  }

  function parseDownloadUrlList(raw) {
    return String(raw || '')
      .split(/[,;]/)
      .map(function (s) {
        return s.trim()
      })
      .filter(function (s) {
        return s.indexOf('http') === 0
      })
  }

  function pickDownloadUrl(data) {
    let raw = ''
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      raw = String(data.downloadUrl || '').trim()
    } else if (typeof data === 'string') {
      raw = data.trim()
    }
    const urls = parseDownloadUrlList(raw)
    return urls.length ? urls[Math.floor(Math.random() * urls.length)] : ''
  }

  function detectDevice() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'IOS' : 'Android'
  }

  function openUrl(url, target) {
    if (target === '_self') window.location.href = url
    else window.open(url, target || '_blank')
  }

  function download(downloadOptions) {
    downloadOptions = downloadOptions || {}

    const deviceType = downloadOptions.deviceType || detectDevice()
    const inviteCode = String(
      downloadOptions.inviteCode || readInviteCode(downloadOptions.query),
    ).trim()

    if (deviceType === 'IOS') {
      return ensureBootstrap()
        .then(function () {
          if (!apiBaseUrl) throw new Error('API 线路未就绪')
          const params = new URLSearchParams({ deviceType: 'IOS' })
          if (inviteCode) params.set('inviteCode', inviteCode)
          const url = apiBaseUrl + IOS_LANDING_PATH + '?' + params.toString()
          openUrl(url, downloadOptions.openTarget || '_self')
          return { ok: true, deviceType: deviceType, url: url }
        })
        .catch(function (err) {
          return {
            ok: false,
            deviceType: deviceType,
            reason: 'error',
            message: err && err.message ? err.message : '下载失败',
          }
        })
    }

    return gatewayRequest({
      uri: 'config/landing',
      method: 1,
      body: '',
      params: {
        deviceType: 'Android',
        inviteCode: inviteCode || undefined,
      },
      timeout: downloadOptions.timeout,
    })
      .then(function (res) {
        if (BIZ_SUCCESS_CODES.indexOf(String(res.code).trim()) === -1) {
          return {
            ok: false,
            deviceType: deviceType,
            reason: 'error',
            message: res.msg || '请求失败',
          }
        }
        const url = pickDownloadUrl(res.data)
        if (!url) {
          return { ok: false, deviceType: deviceType, reason: 'empty', message: '未获取到下载地址' }
        }
        openUrl(url, downloadOptions.openTarget || '_blank')
        return { ok: true, deviceType: deviceType, url: url }
      })
      .catch(function (err) {
        return {
          ok: false,
          deviceType: deviceType,
          reason: 'error',
          message: err && err.message ? err.message : '下载失败',
        }
      })
  }

  function init(initOptions) {
    initOptions = initOptions || {}
    sdkOptions = {
      apiDomainBootstrapUrls:
        initOptions.apiDomainBootstrapUrls || sdkOptions.apiDomainBootstrapUrls,
      cacheKey: initOptions.cacheKey || sdkOptions.cacheKey,
      timeout: initOptions.timeout || sdkOptions.timeout,
      debug: !!initOptions.debug,
    }
    apiBaseUrl = ''
    bootstrapPromise = null
    return ensureBootstrap()
  }

  const sdk = {
    init: init,
    download: download,
    downloadAndroid: function (opts) {
      return download(Object.assign({}, opts || {}, { deviceType: 'Android' }))
    },
    downloadIos: function (opts) {
      return download(Object.assign({}, opts || {}, { deviceType: 'IOS' }))
    },
    readInviteCode: readInviteCode,
    gatewayRequest: gatewayRequest,
    getState: function () {
      return { apiBaseUrl: apiBaseUrl }
    },
  }

  window.LandingDownloadSDK = sdk
})(window)
