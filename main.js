(function () {
  const menuToggle = document.querySelector("[data-menu-toggle]");
  const navLinks = document.querySelector("[data-nav-links]");

  if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", function () {
      navLinks.classList.toggle("open");
    });

    navLinks.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        navLinks.classList.remove("open");
      });
    });
  }

  const currentPage = document.body.getAttribute("data-page");
  if (currentPage) {
    const activeLink = document.querySelector('[data-nav="' + currentPage + '"]');
    if (activeLink) {
      activeLink.classList.add("active");
    }
  }

  const revealObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16 }
  );

  document.querySelectorAll(".reveal").forEach(function (node) {
    revealObserver.observe(node);
  });

  const yearNode = document.querySelector("[data-year]");
  if (yearNode) {
    yearNode.textContent = String(new Date().getFullYear());
  }

  const contactForm = document.getElementById("candidate-contact-form");
  if (contactForm) {
    contactForm.addEventListener("submit", function (event) {
      event.preventDefault();

      const formData = new FormData(contactForm);
      const entries = Object.fromEntries(formData.entries());

      const lines = [
        "Name: " + (entries.name || ""),
        "Email: " + (entries.email || ""),
        "Phone: " + (entries.phone || ""),
        "Company: " + (entries.company || ""),
        "Industry: " + (entries.industry || ""),
        "Current process: " + (entries.process || ""),
        "Primary pain point: " + (entries.pain || ""),
        "Requested timeline: " + (entries.timeline || "")
      ];

      const body = encodeURIComponent(lines.join("\n"));
      const subject = encodeURIComponent("Website inquiry from " + (entries.name || "prospect"));
      window.location.href = "mailto:pj@aissistedconsulting.com?subject=" + subject + "&body=" + body;
    });
  }
})();
