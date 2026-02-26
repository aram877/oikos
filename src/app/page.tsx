import { redirect } from 'next/navigation'

/** Redirect root URL to the dashboard. */
export default function Home() {
  redirect('/dashboard')
}
