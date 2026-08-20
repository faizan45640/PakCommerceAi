#!/usr/bin/env python3
"""
PakCommerce AI - Seller Outreach Guide Generator
Generates clean HTML and Markdown guides.
"""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "docs" / "outreach"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

HTML_FILE = OUTPUT_DIR / "Seller_Outreach_Field_Guide.html"
MD_FILE = OUTPUT_DIR / "Seller_Outreach_Field_Guide.md"

HTML_CONTENT = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PakCommerce AI — Seller Outreach & Data Guide</title>
  <style>
    :root {
      --primary: #1e3a5f;
      --heading: #0f172a;
      --text: #334155;
      --bg: #f8fafc;
      --card: #ffffff;
      --border: #e2e8f0;
      --success-bg: #f0fdf4;
      --success-border: #86efac;
      --success-text: #166534;
      --danger-bg: #fef2f2;
      --danger-border: #fecaca;
      --danger-text: #991b1b;
      --quote-bg: #f8fafc;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      margin: 0;
      padding: 30px 15px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: var(--card);
      padding: 35px;
      border-radius: 10px;
      border: 1px solid var(--border);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    h1 {
      color: var(--primary);
      font-size: 24px;
      margin-top: 0;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 10px;
    }
    h2 {
      color: var(--primary);
      font-size: 18px;
      margin-top: 28px;
      margin-bottom: 10px;
    }
    .payout-table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0;
    }
    .payout-table th, .payout-table td {
      border: 1px solid #cbd5e1;
      padding: 10px 14px;
      text-align: left;
    }
    .payout-table th {
      background: #1e3a5f;
      color: white;
    }
    .payout-table td:nth-child(2) {
      font-weight: bold;
      color: #166534;
    }
    .box-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin: 14px 0;
    }
    .box {
      padding: 14px 16px;
      border-radius: 8px;
    }
    .box-success {
      background: var(--success-bg);
      border: 1px solid var(--success-border);
      color: var(--success-text);
    }
    .box-danger {
      background: var(--danger-bg);
      border: 1px solid var(--danger-border);
      color: var(--danger-text);
    }
    .template-box {
      background: var(--quote-bg);
      border-left: 4px solid var(--primary);
      border-top: 1px solid var(--border);
      border-right: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      padding: 14px 18px;
      margin: 14px 0;
      border-radius: 0 8px 8px 0;
      white-space: pre-wrap;
      font-size: 14.5px;
      color: var(--heading);
    }
    .faq-item {
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 10px;
    }
    .faq-q {
      font-weight: bold;
      color: var(--primary);
      margin-bottom: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>PakCommerce AI — Seller Outreach & Data Guide</h1>
    <p><em>A step-by-step guide for connecting with Pakistani online stores and collecting past delivery history.</em></p>

    <h2>1. Your Payout & Earnings Structure</h2>
    <p>You earn a direct reward for every verified store dataset (Excel or CSV file) you collect and upload:</p>
    <table class="payout-table">
      <tr>
        <th>Store Data Size (Order / Customer History)</th>
        <th>Payout Per Store</th>
      </tr>
      <tr>
        <td>Under 10,000 orders / customers in past history</td>
        <td>Rs. 3,000</td>
      </tr>
      <tr>
        <td>10,000+ orders / customers in past history</td>
        <td>Rs. 5,000</td>
      </tr>
    </table>
    <p><small style="color: #64748b;">Payment is cleared directly once the file is uploaded and verified.</small></p>

    <h2>2. What Are We Doing? (In Simple Words)</h2>
    <p>Every online seller in Pakistan deals with Cash on Delivery (COD). Their biggest headache is that 20% to 30% of buyers reject parcels at their doorstep, causing sellers to lose thousands of rupees in return delivery fees every month.</p>
    <p>We are building <strong>PakCommerce AI</strong> (a university project from UET Lahore) to help sellers predict high-risk returns and choose the best courier (Trax, PostEx, Leopards, TCS) for every city.</p>
    <p><strong>Why sellers share data:</strong> We offer them a <strong>100% Free Delivery & Courier Audit Report</strong> showing their return hotspots, courier money lost, and recommendations to save costs.</p>

    <h2>3. Where to Find 25–30 Stores Daily</h2>
    <ul>
      <li><strong>Instagram Hashtags:</strong> Search <code>#clothingbrandpk</code>, <code>#onlineshoppingpakistan</code>, <code>#modestfashionpk</code>, <code>#shoesstorepk</code>. Target pages with 2k to 50k followers.</li>
      <li><strong>Suggested Accounts:</strong> Tap the arrow next to "Follow" on any brand page to see 15–20 similar brand pages.</li>
      <li><strong>WhatsApp Link:</strong> Most brand bios have a direct WhatsApp Business link (wa.me link).</li>
    </ul>

    <h2>4. Data Privacy: What We Need vs. What We DO NOT Want</h2>
    <div class="box-grid">
      <div class="box box-success">
        <strong>✓ What We Need:</strong>
        <ul>
          <li>Order Date</li>
          <li>Destination City</li>
          <li>Order Total in PKR</li>
          <li>Item Category</li>
          <li>Courier Name</li>
          <li>Delivery Status (Delivered / Returned)</li>
        </ul>
      </div>
      <div class="box box-danger">
        <strong>✗ What We DO NOT Want:</strong>
        <ul>
          <li>Customer Full Names</li>
          <li>Complete House / Street Addresses</li>
          <li>Bank account / Credit card info</li>
          <li>Profit margins or product costs</li>
        </ul>
        <small>(Sellers can delete these columns before sending!)</small>
      </div>
    </div>

    <h2>5. Ready-to-Use Message Templates</h2>
    <p><strong>Template 1: WhatsApp / Instagram DM (Roman Urdu) — Best for local brand owners:</strong></p>
    <div class="template-box">AOA! Hope you're doing well. 😊

I came across your store page, really liked your collection!

Actually, we are building **PakCommerce AI** (a tech project from UET Lahore) to help Pakistani online sellers reduce **COD parcel returns and courier shipping losses**.

We are doing **Free Delivery & Courier Audits** for local brands this week. If you can share a past order export file (Excel/CSV from your Trax, PostEx, or Shopify portal — strictly no customer names or payment info needed), our team will analyze it and send you a free report showing:
1. Which cities have your worst return & cancellation rates.
2. Which courier is costing you the most return delivery losses.
3. Simple recommendations to save shipping costs.

Would you like us to run a free check for your store? Let me know and I can send you the quick 2-minute export steps!</div>

    <p><strong>Template 2: Professional English (LinkedIn / Email):</strong></p>
    <div class="template-box">Hi [Name / Brand],

Hope you're doing well.

I'm reaching out from **PakCommerce AI**, a project built at UET Lahore focusing on helping Pakistani ecommerce sellers reduce **Cash on Delivery (COD) return rates and courier losses**.

We are currently running free **Delivery Performance & Courier Audits** for selected local brands. By looking at an export of your past shipments (no customer personal details or payment info required), we create a custom report showing your return hotspots and courier success rates by city.

Would you be open to receiving a free delivery audit report for your store?

Best regards,
PakCommerce AI Team</div>

    <h2>6. When the Seller Says "Yes, how do I export?"</h2>
    <div class="template-box">Great! You can export your order file in 2 minutes:

• **From Courier Portal (Trax, PostEx, Leopards, TCS):**
  Log in to your portal ➔ Go to Orders / Consignment Reports ➔ Select past 6 to 12 months ➔ Click 'Export as Excel or CSV'.

• **From Shopify:**
  Go to Shopify Admin ➔ Orders ➔ Click 'Export' on top right ➔ Select 'All Orders' or pick a date range ➔ Export as CSV.

• **From WooCommerce:**
  Go to WooCommerce ➔ Orders or Analytics ➔ Export / Download CSV.

*(Note: You are welcome to delete customer names or private address details if you prefer — we only need City, Courier, and Delivered/Returned status).*

You can drop the file right here on WhatsApp!</div>

    <h2>7. Cheat Sheet: Answering Questions & Objections</h2>
    <div class="faq-item">
      <div class="faq-q">Q: "Is my customer data safe?"</div>
      <div><em>"100% safe! We do not need customer names, street addresses, or payment details. We only look at city, order amount, courier name, and delivered or returned status. You can remove any private columns before sending."</em></div>
    </div>
    <div class="faq-item">
      <div class="faq-q">Q: "Are you guys competitors or planning to sell products?"</div>
      <div><em>"No, we are university students and software developers building operational tools for sellers. We do not sell any physical products or run retail stores."</em></div>
    </div>
    <div class="faq-item">
      <div class="faq-q">Q: "How long will the report take?"</div>
      <div><em>"Our team delivers the visual audit report back to you within 24 to 48 hours."</em></div>
    </div>
    <div class="faq-item">
      <div class="faq-q">Q: "Is this really free?"</div>
      <div><em>"Yes, completely free. All we ask in return is your honest feedback on the report."</em></div>
    </div>

    <h2>8. What to Do When You Receive a File</h2>
    <ol>
      <li><strong>Rename the file clearly:</strong> <code>[BrandName]_[CourierOrPlatform]_[Date].xlsx</code></li>
      <li><strong>Note it in the tracking sheet:</strong> Brand Name, WhatsApp number, Order count, Date received.</li>
      <li><strong>Upload the file to the shared Google Drive folder.</strong></li>
      <li><strong>Your payout</strong> will be calculated based on the order count (Rs. 3,000 for &lt;10k, Rs. 5,000 for 10k+) and cleared upon verification.</li>
    </ol>
  </div>
</body>
</html>
"""

def generate_html():
    HTML_FILE.write_text(HTML_CONTENT, encoding="utf-8")
    print(f"Generated HTML Guide: {HTML_FILE}")

if __name__ == "__main__":
    generate_html()
