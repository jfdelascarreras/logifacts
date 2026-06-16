import { redirect } from 'next/navigation'

/** Legacy upload route — combined ingest lives on Premium Analysis. */
export default function UploadPageRedirect() {
  redirect('/premium-analysis#premium-invoice-upload')
}
