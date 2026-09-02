async function test() {
  const res = await fetch("https://suno.com/song/72fd6f8f-79f8-42f0-9a41-14f1df882564");
  const html = await res.text();
  const scriptMatches = Array.from(html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)).map(m => m[1]);
  
  for (const src of scriptMatches) {
    const jsRes = await fetch("https://suno.com" + src);
    if (!jsRes.ok) continue;
    const code = await jsRes.text();
    if (code.includes("/api/mango")) {
      console.log("Chunk with mango:", src);
      const idx = code.indexOf("/api/mango");
      console.log(code.slice(Math.max(0, idx - 200), idx + 300));
    }
    if (code.includes("studio-api") || code.includes("api-es")) {
      const idx = code.search(/studio-api|api-es/);
      console.log("Found API domain in", src, code.slice(Math.max(0, idx - 100), idx + 200));
    }
  }
}
test();
