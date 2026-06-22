// Sidebar toggle
document.querySelectorAll('.repo-group-header').forEach(hdr => {
  hdr.addEventListener('click', () => {
    const links = hdr.nextElementSibling;
    const isOpen = links.classList.contains('visible');
    document.querySelectorAll('.doc-links.visible').forEach(el => el.classList.remove('visible'));
    document.querySelectorAll('.repo-group-header.open').forEach(el => {
      el.classList.remove('open', 'active');
    });
    if (!isOpen) {
      links.classList.add('visible');
      hdr.classList.add('open', 'active');
    }
  });
});

// Scroll-spy: highlight active doc link
const sections = document.querySelectorAll('.doc-section[id]');
const docLinks  = document.querySelectorAll('.doc-link[href^="#"]');

if (sections.length && docLinks.length) {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const id = e.target.id;
        docLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === `#${id}`));
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });

  sections.forEach(s => obs.observe(s));
}

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
