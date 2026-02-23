import { redirect } from 'next/navigation'

/** Redirect root URL to the main transactions screen. */
export default function Home() {
  redirect('/transactions')
}
