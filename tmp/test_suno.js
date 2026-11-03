async function test() {
  const testId = "bd216e5e-4604-48e2-ac6e-7f1698044908";
  const f3 = await fetch("https://suno.com/song/" + testId, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
  });
  const html = await f3.text();
  const audioMatches = html.match(/https:\/\/[^"'\s\\]+\.(mp3|m4a|mp4)/gi);
  console.log("Audio/video links in HTML:", audioMatches);

  const ogAudio = html.match(/property="og:audio"[^>]+content="([^"]+)"/i) || html.match(/content="([^"]+)"[^>]+property="og:audio"/i);
  console.log("og:audio:", ogAudio ? ogAudio[1] : "none");

  const cfMatches = html.match(/https:\/\/[a-z0-9\.\-_]+\.cloudfront\.net\/[^\s"'\\]+/gi);
  console.log("Cloudfront links:", cfMatches ? cfMatches.slice(0, 5) : "none");

  const cdnMatches = html.match(/https:\/\/cdn[0-9]*\.suno\.ai\/[^\s"'\\]+/gi);
  console.log("CDN matches:", cdnMatches ? cdnMatches.slice(0, 5) : "none");
}
test();
