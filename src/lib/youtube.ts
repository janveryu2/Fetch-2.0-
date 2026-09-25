export function youtubeEmbed(
  value: string,
): { src: string; watch: string } | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      ![
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtu.be",
        "www.youtube-nocookie.com",
      ].includes(url.hostname)
    )
      return null;
    const list = url.searchParams.get("list");
    let id =
      url.hostname === "youtu.be"
        ? url.pathname.slice(1)
        : url.searchParams.get("v");
    if (!id && /^\/(embed|shorts)\//.test(url.pathname))
      id = url.pathname.split("/")[2];
    if (id && /^[\w-]{11}$/.test(id))
      return {
        src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=0`,
        watch: `https://www.youtube.com/watch?v=${id}`,
      };
    if (list && /^[\w-]{10,100}$/.test(list))
      return {
        src: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&autoplay=0`,
        watch: `https://www.youtube.com/playlist?list=${list}`,
      };
    return null;
  } catch {
    return null;
  }
}
