import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Page Title',
  description: 'My page description',
  openGraph: {
    title: 'My Page Title',
    description: 'My page description',
    images: ['/og-image.jpg'],
  },
}

export default function Page() {
  return <div>Your content</div>
}
