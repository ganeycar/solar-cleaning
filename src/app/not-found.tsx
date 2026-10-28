import { ButtonLink, PageHero } from "@/components/ui";

export default function NotFound() {
  return (
    <PageHero title="Page not found" intro="That page doesn't exist. Try the homepage or get a quote.">
      <ButtonLink href="/">Go home</ButtonLink>
      <ButtonLink href="/quote" variant="ghost">Get a quote</ButtonLink>
    </PageHero>
  );
}
