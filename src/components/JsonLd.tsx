// Structured data for search engines, as the Next guide recommends
// (node_modules/next/dist/docs/01-app/02-guides/json-ld.md): a plain <script>
// rendered with the page. JSON.stringify doesn't escape "<", so a string holding
// "</script>" could close the tag early; swapping it for its unicode escape keeps
// the JSON identical and the HTML inert.
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
