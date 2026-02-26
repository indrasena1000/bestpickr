'use strict'
require('dotenv').config()
const axios = require('./node_modules/axios')

const id      = process.env.AMAZON_CREDENTIAL_ID
const sec     = process.env.AMAZON_CREDENTIAL_SECRET
const version = process.env.AMAZON_CREDENTIAL_VERSION || '2.2'
const tag     = process.env.AMAZON_ASSOCIATE_TAG
const market  = process.env.AMAZON_MARKETPLACE || 'www.amazon.in'
const scope   = process.env.AMAZON_TOKEN_SCOPE || 'creatorsapi/default'

console.log('Credential ID   :', id)
console.log('Secret length   :', sec && sec.length, '(should be 51)')
console.log('Credential Ver  :', version, '(2.1=NA, 2.2=EU/India, 2.3=FE)')
console.log('Marketplace     :', market)
console.log('Associate Tag   :', tag)
console.log('')

const CREATORS_API = 'https://creatorsapi.amazon'

async function run() {
  // ── STEP 1: Get token using Basic Auth ──────────────────────────
  const basicAuth = Buffer.from(id + ':' + sec).toString('base64')
  const endpoints = process.env.AMAZON_TOKEN_ENDPOINT
    ? [process.env.AMAZON_TOKEN_ENDPOINT]
    : [
        'https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token',
        'https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token',
        'https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token',
      ]

  let token = null
  for (const ep of endpoints) {
    try {
      const { data } = await axios.post(
        ep,
        'grant_type=client_credentials&scope=' + scope,
        {
          headers: {
            'Content-Type':  'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + basicAuth,
          },
          timeout: 8000,
        }
      )
      token = data.access_token
      console.log('✅ Token from:', ep, '— expires in', data.expires_in, 's')
      break
    } catch (e) {
      const d = e.response ? e.response.status + ' ' + JSON.stringify(e.response.data) : e.message
      console.log('❌', ep.split('.com')[0].split('//')[1], '->', d)
    }
  }

  if (!token) {
    console.log('\nAUTH FAILED — credentials not accepted by any token endpoint')
    console.log('\nPossible reasons:')
    console.log('  1. Wrong AMAZON_CREDENTIAL_ID or AMAZON_CREDENTIAL_SECRET')
    console.log('  2. Use Associates Central → Creators API section (NOT old PA-API keys)')
    console.log('  3. Credentials created < 24 hours ago — wait up to 72 hours')
    return
  }

  const headers = {
    'Content-Type':  'application/json; charset=UTF-8',
    'Authorization': 'Bearer ' + token + ', Version ' + version,
    'x-marketplace': market,
  }

  // ── STEP 2: SearchItems ─────────────────────────────────────────
  console.log('\n─── SearchItems: best mobiles under 15000 ───')
  const searchPayload = {
    keywords:    'best mobiles under 15000',
    searchIndex: 'Electronics',
    resources:   [
      'itemInfo.title',
      'itemInfo.byLineInfo',
      'images.primary.large',
      'offersV2.listings.price',
      'offersV2.listings.availability',
    ],
    partnerTag:  tag,
    marketplace: market,
    itemCount:   5,
  }

  let searchResp
  try {
    searchResp = await axios.post(
      CREATORS_API + '/catalog/v1/searchItems',
      searchPayload,
      { headers, timeout: 12000 }
    )
  } catch (e) {
    const status = e.response ? e.response.status : e.message
    const body   = e.response ? e.response.data : null
    console.log('❌ SearchItems failed: HTTP', status)
    if (body) console.log(JSON.stringify(body, null, 2).slice(0, 1000))

    if (status === 429) {
      console.log('\n── WHY 429 ON FIRST REQUEST? ───────────────────────────────')
      console.log('  Token endpoint works (Cognito), but SearchItems is blocked.')
      console.log('  This is NOT a TPS rate limit — it is an ELIGIBILITY block.')
      console.log('')
      console.log('  ROOT CAUSES (check in order):')
      console.log('  1. Associates account has < 10 SHIPPED SALES in last 30 days')
      console.log('     → Log in to affiliate-program.amazon.in')
      console.log('     → Reports → Earnings Report → check shipped orders')
      console.log('     → You need ≥ 10 shipped items, not just clicks')
      console.log('')
      console.log('  2. Credentials created recently (< 72 hours ago)')
      console.log('     → Amazon propagates new credentials slowly across regions')
      console.log('     → Wait up to 72 hours after creating credentials')
      console.log('')
      console.log('  3. Account region mismatch')
      console.log('     → Credential version 2.2 = EU/India marketplace')
      console.log('     → Ensure you created credentials under amazon.in Associates')
      console.log('────────────────────────────────────────────────────────────')
    }
    return
  }

  const items = (searchResp.data.searchResult && searchResp.data.searchResult.items) || []
  console.log('✅ Got', items.length, 'products\n')

  let firstAsin = null
  items.slice(0, 3).forEach(function(item, idx) {
    var v2listings = (item.offersV2 && item.offersV2.listings) || []
    var buyBox = v2listings[0] || {}
    var money  = (buyBox.price && buyBox.price.money) || {}
    var avail  = buyBox.availability && buyBox.availability.type
    var title  = item.itemInfo && item.itemInfo.title && item.itemInfo.title.displayValue
    var brand  = item.itemInfo && item.itemInfo.byLineInfo && item.itemInfo.byLineInfo.brand && item.itemInfo.byLineInfo.brand.displayValue
    var img    = item.images && item.images.primary && item.images.primary.large && item.images.primary.large.url

    if (idx === 0) firstAsin = item.asin

    console.log('#' + (idx + 1), item.asin)
    console.log('  Name  :', title)
    console.log('  Brand :', brand)
    console.log('  Price :', money.displayAmount || (money.amount + ' ' + money.currency))
    console.log('  Stock :', avail)
    console.log('  Image :', img && img.slice(0, 70))
    console.log('  Link  :', 'https://www.amazon.in/dp/' + item.asin + '?tag=' + tag)
    console.log('')
  })

  // ── STEP 3: GetItems (fetch first ASIN with richer data) ────────
  if (!firstAsin) return

  console.log('\n─── GetItems:', firstAsin, '(with features) ───')
  const getPayload = {
    itemIds:    [firstAsin],
    itemIdType: 'ASIN',
    resources:  [
      'itemInfo.title',
      'itemInfo.byLineInfo',
      'itemInfo.features',
      'images.primary.large',
      'offersV2.listings.price',
      'offersV2.listings.availability',
      'offersV2.listings.isBuyBoxWinner',
    ],
    partnerTag:  tag,
    marketplace: market,
  }

  let getResp
  try {
    // Wait 1s between calls to respect 1 TPS free-tier limit
    await new Promise(function(r) { setTimeout(r, 1100) })
    getResp = await axios.post(
      CREATORS_API + '/catalog/v1/getItems',
      getPayload,
      { headers, timeout: 12000 }
    )
  } catch (e) {
    console.log('❌ GetItems failed:', e.response ? e.response.status : e.message)
    if (e.response) console.log(JSON.stringify(e.response.data, null, 2).slice(0, 500))
    return
  }

  const gotItems = (getResp.data.itemResults && getResp.data.itemResults.items) || []
  if (getResp.data.errors && getResp.data.errors.length) {
    console.log('⚠️  Partial errors:', JSON.stringify(getResp.data.errors))
  }

  gotItems.forEach(function(item) {
    var title    = item.itemInfo && item.itemInfo.title && item.itemInfo.title.displayValue
    var features = item.itemInfo && item.itemInfo.features && item.itemInfo.features.displayValues || []
    var v2       = (item.offersV2 && item.offersV2.listings) || []
    var winner   = v2.find(function(l) { return l.isBuyBoxWinner }) || v2[0] || {}
    var money    = (winner.price && winner.price.money) || {}

    console.log('✅ GetItems:', item.asin)
    console.log('  Title   :', title)
    console.log('  Price   :', money.displayAmount || (money.amount + ' ' + money.currency))
    console.log('  BuyBox  :', winner.isBuyBoxWinner ? 'YES' : 'NO')
    if (features.length) {
      console.log('  Features:')
      features.slice(0, 3).forEach(function(f) { console.log('    •', f) })
    }
  })
}

run().catch(function(e) {
  console.error('FATAL:', e.message)
  if (e.response) console.error(JSON.stringify(e.response.data))
})
