"""Shared constants — mirrors lib/invoices/headers.ts (UPS 250-column layout)."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

FEDEX_PARSE_VERSION = "fedex-v2"
WWE_PARSE_VERSION = "wwe-v1"
UPS_PARSE_VERSION = "ups-csv-v1"

FEDEX_RATES_JSON = REPO_ROOT / "lib" / "pricing" / "data" / "fedex-rates.json"
UPS_FUEL_HISTORY_JSON = REPO_ROOT / "lib" / "pricing" / "data" / "ups-fuel-surcharge-history.json"

DEFAULT_MAPPING_FILE = REPO_ROOT / "Invoices skills" / "Master_Mapping_Consolidated_Updated.xlsx"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "outputs" / "invoice_analysis"

SURCHARGE_CATS = frozenset({"FUEL SURCHARGE", "ACCESSORIAL SURCHARGE", "SURCHARGE"})

UPS_HEADERS = [
    "Version", "Recipient Number", "Account Number", "Account Country", "Invoice Date", "Invoice Number",
    "Invoice Type Code", "Invoice Type Detail Code", "Account Tax ID", "Invoice Currency Code",
    "Invoice Amount", "Transaction Date", "Pickup Record Number", "Lead Shipment Number", "World Ease Number",
    "Shipment Reference Number 1", "Shipment Reference Number 2", "Bill Option Code", "Package Quantity",
    "Oversize Quantity", "Tracking Number", "Package Reference Number 1", "Package Reference Number 2",
    "Package Reference Number 3", "Package Reference Number 4", "Package Reference Number 5",
    "Entered Weight", "Entered Weight Unit of Measure", "Billed Weight", "Billed Weight Unit of Measure",
    "Container Type", "Billed Weight Type", "Package Dimensions", "Zone", "Charge Category Code",
    "Charge Category Detail Code", "Charge Source", "Type Code 1", "Type Detail Code 1", "Type Detail Value 1",
    "Type Code 2", "Type Detail Code 2", "Type Detail Value 2", "Charge Classification Code",
    "Charge Description Code", "Charge Description", "Charged Unit Quantity", "Basis Currency Code",
    "Basis Value", "Tax Indicator", "Transaction Currency Code", "Incentive Amount", "Net Amount",
    "Miscellaneous Currency Code", "Miscellaneous Incentive Amount", "Miscellaneous Net Amount",
    "Alternate Invoicing Currency Code", "Alternate Invoice Amount", "Invoice Exchange Rate",
    "Tax Variance Amount", "Currency Variance Amount", "Invoice Level Charge", "Invoice Due Date",
    "Alternate Invoice Number", "Store Number", "Customer Reference Number", "Sender Name",
    "Sender Company Name", "Sender Address Line 1", "Sender Address Line 2", "Sender City",
    "Sender State", "Sender Postal", "Sender Country", "Receiver Name", "Receiver Company Name",
    "Receiver Address Line 1", "Receiver Address Line 2", "Receiver City", "Receiver State",
    "Receiver Postal", "Receiver Country", "Third Party Name", "Third Party Company Name",
    "Third Party Address Line 1", "Third Party Address Line 2", "Third Party City", "Third Party State",
    "Third Party Postal", "Third Party Country", "Sold To Name", "Sold To Company Name",
    "Sold To Address Line 1", "Sold To Address Line 2", "Sold To City", "Sold To State",
    "Sold To Postal", "Sold To Country", "Miscellaneous Address Qual 1", "Miscellaneous Address 1 Name",
    "Miscellaneous Address 1 Company Name", "Miscellaneous Address 1 Address Line 1",
    "Miscellaneous Address 1 Address Line 2", "Miscellaneous Address 1 City",
    "Miscellaneous Address 1 State", "Miscellaneous Address 1 Postal", "Miscellaneous Address 1 Country",
    "Miscellaneous Address Qual 2", "Miscellaneous Address 2 Name", "Miscellaneous Address 2 Company Name",
    "Miscellaneous Address 2 Address Line 1", "Miscellaneous Address 2 Address Line 2",
    "Miscellaneous Address 2 City", "Miscellaneous Address 2 State", "Miscellaneous Address 2 Postal",
    "Miscellaneous Address 2 Country", "Shipment Date", "Shipment Export Date", "Shipment Import Date",
    "Entry Date", "Direct Shipment Date", "Shipment Delivery Date", "Shipment Release Date", "Cycle Date",
    "EFT Date", "Validation Date", "Entry Port", "Entry Number", "Export Place", "Shipment Value Amount",
    "Shipment Description", "Entered Currency Code", "Customs Number", "Exchange Rate",
    "Master Air Waybill Number", "EPU", "Entry Type", "CPC Code", "Line Item Number", "Goods Description",
    "Entered Value", "Duty Amount", "Weight", "Unit of Measure", "Item Quantity",
    "Item Quantity Unit of Measure", "Import Tax ID", "Declaration Number", "Carrier Name", "CCCD Number",
    "Cycle Number", "Foreign Trade Reference Number", "Job Number", "Transport Mode", "Tax Type",
    "Tariff Code", "Tariff Rate", "Tariff Treatment Number", "Contact Name", "Class Number",
    "Document Type", "Office Number", "Document Number", "Duty Value", "Total Value for Duty",
    "Excise Tax Amount", "Excise Tax Rate", "GST Amount", "GST Rate", "Order In Council",
    "Origin Country", "SIMA Access", "Tax Value", "Total Customs Amount", "Miscellaneous Line 1",
    "Miscellaneous Line 2", "Miscellaneous Line 3", "Miscellaneous Line 4", "Miscellaneous Line 5",
    "Payor Role Code", "Miscellaneous Line 7", "Miscellaneous Line 8", "Miscellaneous Line 9",
    "Miscellaneous Line 10", "Miscellaneous Line 11", "Duty Rate", "VAT Basis Amount", "VAT Amount",
    "VAT Rate", "Other Basis Amount", "Other Amount", "Other Rate", "Other Customs Number Indicator",
    "Other Customs Number", "Customs Office Name", "Package Dimension Unit Of Measure",
    "Original Shipment Package Quantity", "Corrected Zone", "Tax Law Article Number",
    "Tax Law Article Basis Amount", "Original tracking number", "Scale weight quantity",
    "Scale Weight Unit of Measure", "Raw dimension unit of measure", "Raw dimension length",
    "BOL # 1", "BOL # 2", "BOL # 3", "BOL # 4", "BOL # 5", "PO # 1", "PO # 2", "PO # 3",
    "PO # 4", "PO # 5", "PO # 6", "PO # 7", "PO # 8", "PO # 9", "PO # 10", "NMFC",
    "Detail Class", "Freight Sequence Number", "Declared Freight Class", "EORI Number",
    "Detail Keyed Dim", "Detail Keyed Unit of Measure", "Detail Keyed Billed Dimension",
    "Detail Keyed Billed Unit of Measure", "Original Service Description",
    "Promo Discount Applied Indicator", "Promo Discount Alias",
    "Place Holder 42", "Place Holder 43", "Place Holder 44", "Place Holder 45",
    "Place Holder 46", "Place Holder 47", "Place Holder 48", "Place Holder 49",
    "Place Holder 50", "Place Holder 51", "Place Holder 52", "Place Holder 53",
    "Place Holder 54", "Place Holder 55", "Place Holder 56", "Place Holder 57",
    "Place Holder 58", "Place Holder 59",
]

UPS_CRITICAL_COLUMNS = [
    "Invoice Date", "Invoice Number", "Invoice Amount", "Package Quantity",
    "Tracking Number", "Entered Weight", "Billed Weight", "Charge Category Code",
    "Charge Classification Code", "Charge Description", "Net Amount", "Duty Amount",
]

STANDARD_COLUMNS = [
    "Carrier Name",
    "Source File",
    "Invoice Date",
    "Invoice Number",
    "Account Number",
    "Tracking Number",
    "Shipment Reference Number 1",
    "Lead Shipment Number",
    "Charge Description",
    "Net Amount",
    "Invoice Amount",
    "Duty Amount",
    "Package Quantity",
    "Billed Weight",
    "Entered Weight",
    "Zone",
    "Charge Classification Code",
    "Charge Category Code",
    "Original Service Description",
    "Receiver State",
    "Sender Company Name",
    "Transportation_Mode",
    "Category 1",
    "Category 2",
    "Category 3",
    "Category 4",
    "Category 5",
    "mapped",
]
