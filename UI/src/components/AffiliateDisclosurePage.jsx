// src/components/AffiliateDisclosurePage.jsx
// Standalone component — Amazon / FTC / India compliant affiliate disclosure page
import {
  Shell, H2, Callout, P, Li,
  CONTACT, TODAY,
} from '../pages/StaticPage.jsx'

export default function AffiliateDisclosurePage({ onHome, onNav }) {
  return (
    <Shell
      title="Affiliate Disclosure"
      badge="Transparency"
      subtitle="How bestpickr earns revenue — and why it never affects your results."
      onHome={onHome}
    >

      {/* ── FTC / Amazon mandatory top disclosure ── */}
      <Callout icon="📢" title="Affiliate Disclosure — Required Notice">
        <strong>As an Amazon Associate I earn from qualifying purchases.</strong>
        {' '}bestpickr participates in affiliate advertising programs including the Amazon Associates Program,
        Flipkart Affiliate Program, and Myntra Affiliate Program. When you click a product link on bestpickr
        and make a qualifying purchase, we may earn a commission at <strong>no additional cost to you</strong>.
        {' '}This disclosure is made in compliance with the U.S. Federal Trade Commission (FTC) guidelines
        (16 CFR Part 255), Amazon Associates Program Operating Agreement, and applicable Indian Consumer
        Protection regulations.
        {' '}<strong>This disclosure is displayed at the beginning of all affiliate-linked content and near all
        product recommendation sections, in accordance with Amazon Associates Program requirements.</strong>
      </Callout>

      <H2 mt={20}>1. What Is an Affiliate Link?</H2>
      <P>
        An affiliate link is a specially tracked URL that tells the retailer (Amazon, Flipkart, etc.) that a
        visitor arrived via bestpickr. If you make a qualifying purchase within the retailer's attribution
        window (typically 24 hours for Amazon), bestpickr earns a small percentage commission on that sale.
      </P>
      <P>
        The price you pay is <strong>identical</strong> to buying directly. Affiliate programs are funded by
        the retailer — not by added costs to the buyer.
      </P>
      <Callout icon="🍪" title="Affiliate Cookie Tracking">
        Affiliate links may use cookies to track qualifying purchases in accordance with each retailer's
        affiliate program policies. These cookies are set by the retailer (Amazon, Flipkart, Myntra) — not
        by bestpickr — when you click through to their site. For more information on how we handle data,
        please refer to our{' '}
        <button
          onClick={() => onNav && onNav('privacy')}
          style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', fontSize:'inherit', textDecoration:'underline', padding:0 }}
        >
          Privacy Policy
        </button>.
      </Callout>

      <H2>2. Amazon Associates Program</H2>
      <Callout icon="🛒" title="Required Amazon Associates Disclosure">
        <strong>As an Amazon Associate I earn from qualifying purchases.</strong>
        {' '}bestpickr is a participant in the <strong>Amazon Associates Program</strong> — an affiliate
        advertising program designed to provide a means for sites to earn advertising fees by advertising
        and linking to Amazon.in and Amazon.com.
        {' '}<strong>Amazon and the Amazon logo are trademarks of Amazon.com, Inc. or its affiliates.
        bestpickr is an independent website and is not owned, operated, or endorsed by Amazon.</strong>
      </Callout>
      <ul style={{ paddingLeft:20, marginBottom:14 }}>
        <Li>We link directly to product pages on <strong>Amazon.in</strong> (India) via the Amazon Associates Program.</Li>
        <Li>Our associate tag is embedded in all Amazon product URLs on this site.</Li>
        <Li>We comply with the <strong>Amazon Associates Operating Agreement</strong> and applicable Program Policies.</Li>
        <Li>
          <strong>Product prices and availability are accurate as of the date/time indicated and are subject
          to change. Any price and availability information displayed on Amazon.in at the time of purchase
          will apply to the purchase of that product.</strong>
        </Li>
        <Li>Product images displayed from Amazon are used in accordance with the Amazon Associates Program image usage guidelines.</Li>
        <Li>Depending on your geographic location, you may be redirected to the appropriate Amazon storefront (Amazon.in for India, Amazon.com for international visitors).</Li>
        <Li>We do not copy Amazon customer reviews verbatim, use Amazon's star rating graphics, or use phrases such as "Amazon's #1 Product", "Best on Amazon", or "Official Amazon Recommended".</Li>
        <Li>Affiliate links are never sent via email. Amazon prohibits the use of affiliate links in email communications and bestpickr complies with this requirement.</Li>
      </ul>

      <H2>3. Other Affiliate Programs</H2>
      <P>In addition to Amazon, bestpickr participates in affiliate programs with:</P>
      <ul style={{ paddingLeft:20, marginBottom:14 }}>
        <Li><strong>Flipkart Affiliate Program</strong> — We link to products on Flipkart.com and may earn a commission on qualifying purchases.</Li>
        <Li><strong>Myntra Affiliate Program</strong> — We link to products on Myntra.com and may earn a commission on qualifying purchases.</Li>
      </ul>
      <P>All affiliate relationships are governed by the respective platform's affiliate program terms and conditions. bestpickr is independent of and not endorsed by Flipkart or Myntra.</P>

      <H2>4. Rankings &amp; Editorial Independence</H2>
      <Callout icon="⚖️" title="Complete Editorial Independence">
        Rankings on bestpickr are generated algorithmically based on publicly available buyer metrics —
        verified review counts, average ratings, and sentiment signals — and are{' '}
        <strong>not manually adjusted based on affiliate commission rates</strong>. We earn the same
        commission regardless of which product you click or which platform you buy from.
      </Callout>
      <P>Our commitment in full:</P>
      <ul style={{ paddingLeft:20, marginBottom:14 }}>
        <Li>We do not incentivise purchases through affiliate links.</Li>
        <Li>We do not receive free products in exchange for rankings or reviews.</Li>
        <Li>Commission rates do not influence product positioning.</Li>
        <Li>Retailers cannot pay to improve placement on bestpickr.</Li>
        <Li>No brand, seller, or platform has ever paid bestpickr to influence a product's ranking.</Li>
      </ul>

      <H2>5. Pricing &amp; Availability Disclaimer</H2>
      <Callout icon="⚠️" bg='#FFF9E6' color='#B8860B' title="Always verify price before purchasing">
        <strong>Product prices and availability are accurate as of the date/time indicated and are subject
        to change. Any price and availability information displayed on the retailer's website at the time
        of purchase will apply to the purchase of that product.</strong> bestpickr is not responsible for
        pricing errors or changes that occur after data is fetched from retailer APIs.
      </Callout>
      <P>
        bestpickr does not make any representations or warranties regarding products purchased through
        affiliate links. All product claims, guarantees, and warranties are provided solely by the retailer
        or manufacturer — not by bestpickr.
      </P>

      <H2>6. Trademarks &amp; No Endorsement</H2>
      <ul style={{ paddingLeft:20, marginBottom:14 }}>
        <Li><strong>Amazon and the Amazon logo are trademarks of Amazon.com, Inc. or its affiliates. bestpickr is an independent website and is not owned, operated, or endorsed by Amazon.</strong></Li>
        <Li>"Flipkart" and "Myntra" and their respective logos are trademarks of their respective companies. bestpickr is not affiliated with, endorsed by, or sponsored by Flipkart or Myntra.</Li>
        <Li>Product names and brand names are trademarks of their respective owners and are used solely for editorial identification and comparison purposes — not to imply sponsorship or endorsement.</Li>
        <Li>Product images are sourced via retailer APIs as permitted under their respective affiliate program guidelines.</Li>
        <Li>We do not use Amazon logos, stylised "Amazon" branding, or Amazon star-rating graphics in our own interface or marketing.</Li>
      </ul>

      <H2>7. FTC &amp; International Compliance</H2>
      <P>bestpickr is designed to meet the disclosure standards of:</P>
      <ul style={{ paddingLeft:20, marginBottom:14 }}>
        <Li>
          <strong>FTC (USA)</strong> — 16 CFR Part 255: Affiliate relationships are clearly and
          conspicuously disclosed in the site-wide footer on every page and at the beginning of all
          product recommendation content — not buried in terms or a separate page alone.
        </Li>
        <Li><strong>ASA (UK)</strong> — CAP Code: affiliate/commercial intent is clearly flagged on every page.</Li>
        <Li>
          <strong>CCPA (California, USA)</strong> — We do not sell personal data. See our{' '}
          <button
            onClick={() => onNav && onNav('privacy')}
            style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', fontSize:'inherit', textDecoration:'underline', padding:0 }}
          >
            Privacy Policy
          </button>.
        </Li>
        <Li>
          <strong>Indian Consumer Protection Act (2019)</strong> — Material connections between content
          creators and brands are disclosed as required under Section 2(47) and applicable ASCI guidelines.
        </Li>
      </ul>

      <H2>8. What We Do &amp; Don't Do</H2>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <div style={{ background:'#F0FBF4', border:'1px solid #C8E6D4', borderRadius:'var(--r2)', padding:'16px 18px' }}>
          <div style={{ fontWeight:700, fontSize:13, color:'var(--accent)', marginBottom:10 }}>✅ What we DO</div>
          <ul style={{ paddingLeft:16, margin:0 }}>
            <Li>Display the mandatory Amazon Associates disclosure on every page</Li>
            <Li>Rank products algorithmically based solely on buyer satisfaction data</Li>
            <Li>Use exact Amazon-required price/availability disclaimer language</Li>
            <Li>Embed associate tag in all Amazon product URLs</Li>
            <Li>Link directly to the retailer's official product page without cloaking</Li>
            <Li>Maintain equal treatment across all platforms</Li>
            <Li>Disclose affiliate cookie tracking clearly</Li>
          </ul>
        </div>
        <div style={{ background:'#FFF5F5', border:'1px solid #FFC9C9', borderRadius:'var(--r2)', padding:'16px 18px' }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#C0392B', marginBottom:10 }}>❌ What we DON'T do</div>
          <ul style={{ paddingLeft:16, margin:0 }}>
            <Li>Accept sponsored placements or paid rankings</Li>
            <Li>Adjust rankings based on commission rates</Li>
            <Li>Copy Amazon customer reviews verbatim</Li>
            <Li>Use Amazon star-rating graphics outside API terms</Li>
            <Li>Use phrases like "Amazon's #1" or "Official Amazon Recommended"</Li>
            <Li>Send affiliate links in emails (prohibited by Amazon)</Li>
            <Li>Cloak or hide affiliate URLs deceptively</Li>
            <Li>Receive free products in exchange for rankings</Li>
          </ul>
        </div>
      </div>

      <H2>9. Questions &amp; Contact</H2>
      <P>If you have any questions about our affiliate relationships, how we earn revenue, or any concern about a specific product link, please contact us:</P>
      <P>📧 <a href={`mailto:${CONTACT}`} style={{ color:'var(--accent)' }}>{CONTACT}</a></P>
      <P style={{ fontSize:12, color:'var(--ink4)' }}>
        Last updated: {TODAY}. bestpickr reserves the right to update this disclosure as our affiliate
        partnerships change. Material changes will be reflected in the "Last updated" date above.
      </P>
    </Shell>
  )
}
