import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col justify-center text-center flex-1 px-4">
      <h1 className="text-3xl font-bold mb-4">email-utils</h1>
      <p className="text-fd-muted-foreground mb-6">
        Small, focused packages for checking and normalizing email addresses.
      </p>
      <p>
        <Link href="/docs" className="font-medium underline">
          Read the docs
        </Link>
      </p>
    </div>
  );
}
