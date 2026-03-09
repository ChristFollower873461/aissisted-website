document.addEventListener('DOMContentLoaded',function(){
const depth=window.location.pathname.split('/').filter(p=>p).length;
const isSubdir=document.querySelector('link[href*="../styles.css"]')!==null;
const base=isSubdir?'../':'./';
const headerHTML=`<nav id="nav">
<div class="container">
<a href="${base}index.html" class="nav-logo" aria-label="AIssisted Consulting Home">
<img src="${base}img/square-logo.svg?v=1" alt="AIssisted Consulting" class="nav-logo-mark">
<span class="nav-logo-wordmark">AIssisted Consulting</span>
</a>
<div class="nav-links" id="navLinks">
<a href="${base}services.html">Services</a>
<a href="${base}industries/">Industries</a>
<a href="${base}pricing.html">Pricing</a>
<a href="${base}compare.html">Compare</a>
<a href="${base}about.html">About</a>
<a href="${base}case-studies.html">Case Studies</a>
<a href="${base}tools.html">Tools</a>
<a href="${base}blog/">Blog</a>
<a href="${base}reserve.html" class="btn nav-reserve" style="background:transparent;border:2px solid var(--gold-mid);color:var(--gold-mid);padding:10px 20px;font-size:.85rem">Reserve</a>
<a href="${base}contact.html" class="btn btn-primary nav-cta">Get Started</a>
</div>
<button class="hamburger" id="hamburger" aria-label="Toggle menu">
<span></span><span></span><span></span>
</button>
</div>
</nav>`;
const headerContainer=document.getElementById('header-container');
if(headerContainer){headerContainer.innerHTML=headerHTML;initNav(base);}
});
function initNav(base){
const hamburger=document.getElementById('hamburger');
const navLinks=document.getElementById('navLinks');
const nav=document.getElementById('nav');
if(hamburger){hamburger.addEventListener('click',()=>{navLinks.classList.toggle('open');});}
window.addEventListener('scroll',()=>{if(nav){nav.classList.toggle('scrolled',window.scrollY>50);}});
const currentPath=window.location.pathname;
const links=navLinks.querySelectorAll('a:not(.nav-cta)');
links.forEach(link=>{
const href=link.getAttribute('href');
if(currentPath.endsWith(href.replace(base,''))||(currentPath.includes('/industries/')&&href.includes('industries/'))||(currentPath.includes('/blog/')&&href.includes('blog/'))){link.classList.add('active');}
});
document.querySelectorAll('a[href^="#"]').forEach(a=>{a.addEventListener('click',e=>{const href=a.getAttribute('href');if(href.startsWith('#')){e.preventDefault();const t=document.querySelector(href);if(t)t.scrollIntoView({behavior:'smooth'});if(navLinks)navLinks.classList.remove('open');}});});
const observer=new IntersectionObserver((entries)=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');observer.unobserve(e.target);}});},{threshold:0.1,rootMargin:'0px 0px -40px 0px'});
document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
document.querySelectorAll('.faq-q').forEach(btn=>{btn.addEventListener('click',()=>{const item=btn.parentElement;document.querySelectorAll('.faq-item').forEach(i=>{if(i!==item)i.classList.remove('open');});item.classList.toggle('open');});});
}
