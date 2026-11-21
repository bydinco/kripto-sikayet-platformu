export default async function LocaleHomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  return (
    <main>
      <p>{locale === 'tr' ? 'Yakında.' : 'Coming soon.'}</p>
    </main>
  );
}
