/** Motif graphique : une fenêtre cintrée au trait, avec reflets. Discret, sans cliché « bulles ». */
export function WindowMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 420" className={className} aria-hidden="true" fill="none">
      <path d="M10 410V160a150 150 0 0 1 300 0v250Z" stroke="#292C2B" strokeWidth="1.5" />
      <path d="M28 410V164a132 132 0 0 1 264 0v246" stroke="#292C2B" strokeWidth="0.75" />
      <path d="M160 32v378M28 164h264M28 290h264" stroke="#292C2B" strokeWidth="1.5" />
      <path d="M48 400 128 196M74 400l70-176M182 400l90-230M212 400l64-164" stroke="#A5AAA6" strokeWidth="1" />
      <path d="M92 150c12-48 38-84 60-98" stroke="#A5AAA6" strokeWidth="1" />
      <circle cx="160" cy="290" r="3" fill="#292C2B" />
    </svg>
  );
}
