#!/usr/bin/env python3
"""
PakCommerce AI - Seller Outreach Guide Generator
Written by Faizan for outreach team members to approach Pakistani ecommerce sellers.
"""

from pathlib import Path

# Paths
REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "docs" / "outreach"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

HTML_FILE = OUTPUT_DIR / "Seller_Outreach_Field_Guide.html"
MD_FILE = OUTPUT_DIR / "Seller_Outreach_Field_Guide.md"

MARKDOWN_CONTENT = """# PakCommerce AI - Seller Outreach & Data Guide

Hey! Thanks for helping out with this.

Here is a simple, step-by-step guide on what we are doing, what data we need from online sellers, how to talk to them, and how to answer their questions.

---

## 1. What Are We Doing? (In Simple Words)

Every online seller in Pakistan deals with Cash on Delivery (COD). The biggest headache for them is that 20% to 30% of buyers reject parcels at their doorstep, and the seller has to pay return delivery charges out of their own pocket.

We are building **PakCommerce AI** (our university final year project at UET Lahore) to solve this. Our software analyzes orders before dispatch to flag high-risk parcels and recommend the best courier (Trax, PostEx, Leopards, TCS) for every city.

**Your main task:** Reach out to local Pakistani online sellers on Instagram, WhatsApp, or LinkedIn, offer them a **Free Delivery & Courier Audit Report**, and collect an Excel/CSV export of their past order delivery history.

---

## 2. Why Will Sellers Give You Their Data?

Sellers won't share data just for a favor, but they will happily share it when we offer them real value:

1. **Free Delivery & Courier Audit:**  
   We will take their file, run it through our analysis scripts, and send them back a clean report showing:
   * Which cities have their highest return and cancellation rates.
   * Which courier (Trax, PostEx, Leopards, TCS) is failing them the most.
   * How much money they lost on return shipping fees.
2. **Free Early Access:**  
   They get free priority access to use our platform when we launch.

---

## 3. What Data Do We Need? (Keep It Safe & Simple)

When talking to sellers, make sure to reassure them:  
**"We only look at city and delivery success patterns. We do NOT want your customers' private info."**

### What We Need (Standard columns in any export):
* Order Date
* City (e.g. Lahore, Karachi, Multan, Rawalpindi, Faisalabad)
* Order Total in PKR (e.g. Rs. 2,500)
* Product Category / Item Name (e.g. Footwear, Unstitched Clothes, Watches, Mobile Accessories)
* Courier Name (e.g. Trax, PostEx, Leopards, TCS, CallCourier)
* Order Status (Delivered, Returned, Cancelled)
* *(Optional)* Customer phone number (our system automatically scrambles and hashes this right away).

### What We DO NOT Want (Tell them to delete these columns if they want):
* Customer full names
* Complete house / street addresses
* Bank account / credit card details
* Product manufacturing costs / profit margins

---

## 4. How Can the Seller Export the Data? (Takes 2 Minutes)

If a seller agrees and asks how to send the file, guide them with these simple steps:

### Option 1: From Their Courier Portal (Trax, PostEx, Leopards, TCS) - Easiest
1. Log in to the courier portal.
2. Go to **Orders** or **Consignment Reports**.
3. Select the past 6 to 12 months and click **Export as Excel (XLSX) or CSV**.

### Option 2: From Shopify
1. Open Shopify Admin and go to **Orders**.
2. Click **Export** on the top right.
3. Select **"All Orders"** or pick a date range, then click **Export as CSV**.

### Option 3: From WooCommerce
1. Go to **WooCommerce** -> **Orders** or **Analytics**.
2. Click **Export / Download CSV**.

---

## 5. Message Templates (Copy & Paste)

### Template 1: WhatsApp / Instagram DM (Roman Urdu) - Best for local Instagram/FB brands

> "AOA! Hope you're doing well. 😊
>
> I came across your store page, really liked your collection!
>
> Actually, we are building **PakCommerce AI** (a tech project at UET Lahore) to help Pakistani online sellers reduce **COD parcel returns and courier shipping losses**.
>
> We are doing **Free Delivery & Courier Audits** for local brands right now. If you can share a past order export file (Excel/CSV from your Trax, PostEx, or Shopify portal - strictly no customer names or payment info needed), our team will analyze it and send you a free report showing:
> 1. Which cities have your worst return rates.
> 2. Which courier is costing you the most return delivery losses.
> 3. Simple recommendations to save shipping costs.
>
> Would you like us to run a free check for your store? Let me know and I can send you the quick 2-minute export steps!"

---

### Template 2: Professional English (LinkedIn / Email / Store Owners)

> "Hi [Name],
>
> Hope you're doing well.
>
> I'm reaching out from **PakCommerce AI**, a project built at UET Lahore focusing on helping Pakistani ecommerce sellers reduce **Cash on Delivery (COD) return rates and courier losses**.
>
> We are currently running free **Delivery Performance & Courier Audits** for selected local brands. By looking at an anonymized export of your past shipments (no customer personal details or payment info required), we create a custom report showing your return hotspots and courier success rates by city.
>
> Would you be open to receiving a free delivery audit report for [Brand Name]?
>
> Best regards,  
> [Your Name] - PakCommerce AI Team"

---

### Template 3: Quick Phone Talking Points (If calling directly)
* **Greeting:** "AOA, this is [Your Name] from PakCommerce AI. I'm calling quickly regarding a free courier and delivery audit for [Brand Name]."
* **The Problem:** "As you know, COD parcel returns in Pakistan waste thousands of rupees in delivery charges every month."
* **The Offer:** "We are running free reports for sellers using past Trax, PostEx, or Shopify exports to show which cities and couriers have the worst return rates."
* **Privacy:** "You don't have to share any customer names or bank info, just city, courier, and delivered or returned status."
* **Next step:** "Can I drop you a quick WhatsApp message with the simple export steps?"

---

## 6. How to Answer Common Questions (FAQs)

**Q: "Is my customer data safe?"**  
*Answer:* "100%. We do not need customer names, street addresses, or payment details. We only look at city, order amount, courier name, and whether the parcel was delivered or returned. You can remove any private columns before sending the file."

**Q: "Are you guys competitors or planning to sell products?"**  
*Answer:* "No, we are software students and developers building tools for sellers. We do not sell any physical products or run retail stores."

**Q: "How long will the report take?"**  
*Answer:* "Usually within 24 to 48 hours after you send the file."

**Q: "Is this really free?"**  
*Answer:* "Yes, completely free. All we ask in return is your feedback on the report."

---

## 7. What to Do When You Get a File

1. **Rename the file:**  
   `[BrandName]_[CourierOrPlatform]_[Date].csv`  
   *(For example: `KhaadiVibe_Trax_Aug2026.xlsx`)*
2. **Note it down in your tracking sheet:**  
   * Brand Name & Instagram/Website link
   * Contact person name & WhatsApp number
   * Approx number of orders in the file (e.g. 2,000 orders)
   * Date received
3. **Upload the file to our shared Google Drive folder** and let Faizan know on WhatsApp.
"""

HTML_TEMPLATE = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PakCommerce AI - Seller Outreach & Data Guide</title>
  <style>
    :root {{
      --primary: #0284c7;
      --primary-dark: #0369a1;
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
      --quote-bg: #f1f5f9;
    }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      margin: 0;
      padding: 30px 15px;
    }}
    .container {{
      max-width: 840px;
      margin: 0 auto;
      background: var(--card);
      padding: 35px;
      border-radius: 10px;
      border: 1px solid var(--border);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }}
    h1 {{
      color: var(--heading);
      font-size: 26px;
      margin-top: 0;
      border-bottom: 2px solid var(--primary);
      padding-bottom: 10px;
    }}
    h2 {{
      color: var(--heading);
      font-size: 19px;
      margin-top: 28px;
      margin-bottom: 12px;
    }}
    h3 {{
      color: var(--primary-dark);
      font-size: 16px;
      margin-top: 18px;
      margin-bottom: 8px;
    }}
    p, li {{
      font-size: 15px;
    }}
    .box {{
      padding: 14px 18px;
      border-radius: 8px;
      margin: 14px 0;
    }}
    .box-success {{
      background: var(--success-bg);
      border: 1px solid var(--success-border);
      color: var(--success-text);
    }}
    .box-danger {{
      background: var(--danger-bg);
      border: 1px solid var(--danger-border);
      color: var(--danger-text);
    }}
    .template-box {{
      background: var(--quote-bg);
      border-left: 4px solid var(--primary);
      padding: 14px 18px;
      margin: 14px 0;
      border-radius: 0 8px 8px 0;
      white-space: pre-wrap;
      font-size: 14.5px;
      color: var(--heading);
    }}
    .faq-card {{
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 10px;
    }}
    .faq-q {{
      font-weight: bold;
      color: var(--heading);
      margin-bottom: 4px;
    }}
    .faq-a {{
      color: var(--text);
      margin: 0;
    }}
    hr {{
      border: none;
      border-top: 1px solid var(--border);
      margin: 24px 0;
    }}
  </style>
</head>
<body>
  <div class="container">
    <h1>PakCommerce AI - Seller Outreach & Data Guide</h1>
    <p>Hey! Thanks for helping out with this.</p>
    <p>Here is a simple, step-by-step guide on what we are doing, what data we need from online sellers, how to talk to them, and how to answer their questions.</p>

    <hr>

    <h2>1. What Are We Doing? (In Simple Words)</h2>
    <p>Every online seller in Pakistan deals with Cash on Delivery (COD). The biggest headache for them is that 20% to 30% of buyers reject parcels at their doorstep, and the seller has to pay return delivery charges out of their own pocket.</p>
    <p>We are building <strong>PakCommerce AI</strong> (our university final year project at UET Lahore) to solve this. Our software analyzes orders before dispatch to flag high-risk parcels and recommend the best courier (Trax, PostEx, Leopards, TCS) for every city.</p>
    <p><strong>Your main task:</strong> Reach out to local Pakistani online sellers on Instagram, WhatsApp, or LinkedIn, offer them a <strong>Free Delivery & Courier Audit Report</strong>, and collect an Excel/CSV export of their past order delivery history.</p>

    <hr>

    <h2>2. Why Will Sellers Give You Their Data?</h2>
    <p>Sellers won't share data just for a favor, but they will happily share it when we offer them real value:</p>
    <ul>
      <li><strong>Free Delivery & Courier Audit:</strong> We will take their file, run it through our analysis scripts, and send them back a clean report showing:
        <ul>
          <li>Which cities have their highest return and cancellation rates.</li>
          <li>Which courier (Trax, PostEx, Leopards, TCS) is failing them the most.</li>
          <li>How much money they lost on return shipping fees.</li>
        </ul>
      </li>
      <li><strong>Free Early Access:</strong> They get free priority access to use our platform when we launch.</li>
    </ul>

    <hr>

    <h2>3. What Data Do We Need? (Keep It Safe & Simple)</h2>
    <p>When talking to sellers, make sure to reassure them:<br>
    <strong>"We only look at city and delivery success patterns. We do NOT want your customers' private info."</strong></p>

    <div class="box box-success">
      <strong>What We Need (Standard columns in any export):</strong>
      <ul>
        <li>Order Date</li>
        <li>City (e.g. Lahore, Karachi, Multan, Rawalpindi, Faisalabad)</li>
        <li>Order Total in PKR (e.g. Rs. 2,500)</li>
        <li>Product Category / Item Name (e.g. Footwear, Unstitched Clothes, Watches, Mobile Accessories)</li>
        <li>Courier Name (e.g. Trax, PostEx, Leopards, TCS, CallCourier)</li>
        <li>Order Status (Delivered, Returned, Cancelled)</li>
        <li><em>(Optional)</em> Customer phone number (our system automatically scrambles and hashes this right away).</li>
      </ul>
    </div>

    <div class="box box-danger">
      <strong>What We DO NOT Want (Tell them to delete these columns if they want):</strong>
      <ul>
        <li>Customer full names</li>
        <li>Complete house / street addresses</li>
        <li>Bank account / credit card details</li>
        <li>Product manufacturing costs / profit margins</li>
      </ul>
    </div>

    <hr>

    <h2>4. How Can the Seller Export the Data? (Takes 2 Minutes)</h2>
    
    <h3>Option 1: From Their Courier Portal (Trax, PostEx, Leopards, TCS) - Easiest</h3>
    <ol>
      <li>Log in to the courier portal.</li>
      <li>Go to <strong>Orders</strong> or <strong>Consignment Reports</strong>.</li>
      <li>Select the past 6 to 12 months and click <strong>Export as Excel (XLSX) or CSV</strong>.</li>
    </ol>

    <h3>Option 2: From Shopify</h3>
    <ol>
      <li>Open Shopify Admin and go to <strong>Orders</strong>.</li>
      <li>Click <strong>Export</strong> on the top right.</li>
      <li>Select <strong>"All Orders"</strong> or pick a date range, then click <strong>Export as CSV</strong>.</li>
    </ol>

    <h3>Option 3: From WooCommerce</h3>
    <ol>
      <li>Go to <strong>WooCommerce</strong> -> <strong>Orders</strong> or <strong>Analytics</strong>.</li>
      <li>Click <strong>Export / Download CSV</strong>.</li>
    </ol>

    <hr>

    <h2>5. Message Templates (Copy & Paste)</h2>

    <h3>Template 1: WhatsApp / Instagram DM (Roman Urdu) - Best for local Instagram/FB brands</h3>
    <div class="template-box">AOA! Hope you're doing well. 😊

I came across your store page, really liked your collection!

Actually, we are building **PakCommerce AI** (a tech project at UET Lahore) to help Pakistani online sellers reduce **COD parcel returns and courier shipping losses**.

We are doing **Free Delivery & Courier Audits** for local brands right now. If you can share a past order export file (Excel/CSV from your Trax, PostEx, or Shopify portal - strictly no customer names or payment info needed), our team will analyze it and send you a free report showing:
1. Which cities have your worst return rates.
2. Which courier is costing you the most return delivery losses.
3. Simple recommendations to save shipping costs.

Would you like us to run a free check for your store? Let me know and I can send you the quick 2-minute export steps!</div>

    <h3>Template 2: Professional English (LinkedIn / Email / Store Owners)</h3>
    <div class="template-box">Hi [Name],

Hope you're doing well.

I'm reaching out from **PakCommerce AI**, a project built at UET Lahore focusing on helping Pakistani ecommerce sellers reduce **Cash on Delivery (COD) return rates and courier losses**.

We are currently running free **Delivery Performance & Courier Audits** for selected local brands. By looking at an anonymized export of your past shipments (no customer personal details or payment info required), we create a custom report showing your return hotspots and courier success rates by city.

Would you be open to receiving a free delivery audit report for [Brand Name]?

Best regards,
[Your Name] - PakCommerce AI Team</div>

    <h3>Template 3: Quick Phone Talking Points (If calling directly)</h3>
    <ul>
      <li><strong>Greeting:</strong> "AOA, this is [Your Name] from PakCommerce AI. I'm calling quickly regarding a free courier and delivery audit for [Brand Name]."</li>
      <li><strong>The Problem:</strong> "As you know, COD parcel returns in Pakistan waste thousands of rupees in delivery charges every month."</li>
      <li><strong>The Offer:</strong> "We are running free reports for sellers using past Trax, PostEx, or Shopify exports to show which cities and couriers have the worst return rates."</li>
      <li><strong>Privacy:</strong> "You don't have to share any customer names or bank info, just city, courier, and delivered or returned status."</li>
      <li><strong>Next step:</strong> "Can I drop you a quick WhatsApp message with the simple export steps?"</li>
    </ul>

    <hr>

    <h2>6. How to Answer Common Questions (FAQs)</h2>

    <div class="faq-card">
      <div class="faq-q">Q: "Is my customer data safe?"</div>
      <p class="faq-a"><em>"100%. We do not need customer names, street addresses, or payment details. We only look at city, order amount, courier name, and whether the parcel was delivered or returned. You can remove any private columns before sending the file."</em></p>
    </div>

    <div class="faq-card">
      <div class="faq-q">Q: "Are you guys competitors or planning to sell products?"</div>
      <p class="faq-a"><em>"No, we are software students and developers building tools for sellers. We do not sell any physical products or run retail stores."</em></p>
    </div>

    <div class="faq-card">
      <div class="faq-q">Q: "How long will the report take?"</div>
      <p class="faq-a"><em>"Usually within 24 to 48 hours after you send the file."</em></p>
    </div>

    <div class="faq-card">
      <div class="faq-q">Q: "Is this really free?"</div>
      <p class="faq-a"><em>"Yes, completely free. All we ask in return is your feedback on the report."</em></p>
    </div>

    <hr>

    <h2>7. What to Do When You Get a File</h2>
    <ol>
      <li><strong>Rename the file:</strong><br>
        <code>[BrandName]_[CourierOrPlatform]_[Date].csv</code><br>
        <em>(For example: <code>KhaadiVibe_Trax_Aug2026.xlsx</code>)</em>
      </li>
      <li><strong>Note it down in your tracking sheet:</strong><br>
        Brand Name, contact person WhatsApp number, approx number of orders (e.g. 2,000 orders), and date received.</li>
      <li><strong>Upload the file to our shared Google Drive folder</strong> and let Faizan know on WhatsApp.</li>
    </ol>
  </div>
</body>
</html>
"""

def generate_guides():
    MD_FILE.write_text(MARKDOWN_CONTENT, encoding="utf-8")
    print(f"Generated Markdown Guide: {MD_FILE}")

    HTML_FILE.write_text(HTML_TEMPLATE, encoding="utf-8")
    print(f"Generated HTML Guide: {HTML_FILE}")

if __name__ == "__main__":
    generate_guides()
