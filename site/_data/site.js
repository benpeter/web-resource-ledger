export default {
  title: "WRL Documentation",
  baseUrl: "https://webresourceledger.com",
  docsUrl: "https://docs.webresourceledger.com",
  description: "Developer documentation for Web Resource Ledger — cryptographic web evidence API with Ed25519 signatures and RFC 3161 timestamps.",
  nav: [
    {
      section: "Guides",
      children: [
        { title: "Getting Started", url: "/" },
        { title: "Authentication", url: "/authentication/" },
        { title: "Verification", url: "/verification/" },
        { title: "Legal Evidence", url: "/legal-evidence/" },
        { title: "Batch Captures", url: "/batch/" },
        { title: "Schedules", url: "/schedules/" },
      ],
    },
    {
      section: "Reference",
      children: [
        { title: "API Reference", url: "/api-reference/" },
        { title: "Limits & Quotas", url: "/limits/" },
        { title: "Webhooks", url: "/webhooks/" },
        { title: "MCP Server", url: "/mcp/" },
        { title: "Architecture", url: "/architecture/" },
        { title: "Compare", url: "/compare/" },
        { title: "How It Was Built", url: "/about/" },
      ],
    },
    {
      section: "Security & Compliance",
      children: [
        { title: "Overview", url: "/security/" },
        { title: "Whitepaper", url: "/security/whitepaper/" },
        { title: "Data Processing (DPA)", url: "/security/dpa/" },
        { title: "Subprocessors", url: "/security/subprocessors/" },
        { title: "Incident Response", url: "/security/incident-response/" },
        { title: "Data Retention", url: "/security/data-retention/" },
      ],
    },
  ],
};
