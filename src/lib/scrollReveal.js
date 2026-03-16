/* global window, document, IntersectionObserver */

import { useEffect } from "react";

export function useScrollReveal() {
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;

    const reveals = document.querySelectorAll(".reveal, .reveal-stagger");

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("active");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    reveals.forEach((el) => observer.observe(el));
  }, []);
}