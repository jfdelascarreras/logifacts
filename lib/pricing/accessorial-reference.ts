import accessorials from './data/accessorials.json'

function fmtList(n: number) {
  return `$${n.toFixed(2)}`
}

/** 2026 UPS list rates — safe for client import (accessorials.json only). */
export const ACCESSORIAL_REFERENCE = [
  {
    name: 'Address Correction',
    net: fmtList(accessorials.addressCorrection.ground),
    detail: 'list rate',
  },
  {
    name: 'Residential Surcharge (Ground)',
    net: fmtList(accessorials.residentialSurcharge.ground),
    detail: 'list rate',
  },
  {
    name: 'Residential Surcharge (Air)',
    net: fmtList(accessorials.residentialSurcharge.air),
    detail: 'list rate',
  },
  {
    name: 'Delivery Area Surcharge',
    net: `${fmtList(accessorials.deliveryAreaSurcharge.groundCommercial)}–${fmtList(accessorials.deliveryAreaSurcharge.groundResidentialExtended)}`,
    detail: 'list; varies by type',
  },
  {
    name: 'Fuel Surcharge',
    net: 'varies weekly',
    detail: 'see breakdown above',
  },
  {
    name: 'Declared Value',
    net: `${fmtList(accessorials.declaredValue.ratePerHundred)}/$100`,
    detail: `min ${fmtList(accessorials.declaredValue.minimum)}`,
  },
] as const
