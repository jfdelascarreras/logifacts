import accessorials from './data/fedex-accessorials.json'

function fmtList(n: number) {
  return `$${n.toFixed(2)}`
}

export const FEDEX_ACCESSORIAL_REFERENCE = [
  {
    name: 'Home Delivery Residential Surcharge',
    net: fmtList(accessorials.homeDeliveryResidentialSurcharge),
    detail: 'added to HD shipments',
  },
  {
    name: 'Express Residential Surcharge',
    net: fmtList(accessorials.residentialSurcharge.express),
    detail: 'list rate',
  },
  {
    name: 'Delivery Area Surcharge',
    net: `${fmtList(accessorials.deliveryAreaSurcharge.groundCommercial)}–${fmtList(accessorials.deliveryAreaSurcharge.groundResidentialExtended)}`,
    detail: 'list; varies by type',
  },
  {
    name: 'Address Correction',
    net: fmtList(accessorials.addressCorrection),
    detail: 'list rate',
  },
  {
    name: 'Oversize Charge',
    net: `${fmtList(accessorials.oversizeCharge[0].rate)}–${fmtList(accessorials.oversizeCharge[3].rate)}`,
    detail: 'zone-tiered list',
  },
  {
    name: 'Declared Value',
    net: `${fmtList(accessorials.declaredValue.minimumCharge)}–${fmtList(accessorials.declaredValue.ratePerHundred)}/$100`,
    detail: 'varies by value',
  },
] as const
