document.addEventListener('DOMContentLoaded',function(){
const isSubdir=document.querySelector('link[href*="../styles.css"]')!==null;
const base=isSubdir?'../':'./';
const routes={
home:base,
services:`${base}services`,
industries:`${base}industries/`,
pricing:`${base}pricing`,
compare:`${base}compare`,
about:`${base}about`,
caseStudies:`${base}case-studies`,
tools:`${base}tools`,
blog:`${base}blog/`,
reserve:`${base}reserve`,
contact:`${base}contact`
};
const headerHTML=`<nav id="nav">
<div class="container">
<a href="${routes.home}" class="nav-logo nav-logo-textonly" aria-label="AIssisted Consulting Home">
<span class="nav-logo-wordmark nav-logo-wordmark--visible">AIssisted Consulting</span>
</a>
<div class="nav-links" id="navLinks">
<a href="${routes.services}">Services</a>
<a href="${routes.industries}">Industries</a>
<a href="${routes.pricing}">Pricing</a>
<a href="${routes.compare}">Compare</a>
<a href="${routes.about}">About</a>
<a href="${routes.caseStudies}">Case Studies</a>
<a href="${routes.tools}">Tools</a>
<a href="${routes.blog}">Blog</a>
<a href="${routes.reserve}" class="btn nav-reserve" style="background:transparent;border:2px solid var(--gold-mid);color:var(--gold-mid);padding:10px 20px;font-size:.85rem">Reserve</a>
<a href="${routes.contact}" class="btn btn-primary nav-cta">Schedule a Demo</a>
</div>
<button class="hamburger" id="hamburger" aria-label="Toggle menu">
<span></span><span></span><span></span>
</button>
</div>
</nav>`;
const headerContainer=document.getElementById('header-container');
if(headerContainer){
if(!headerContainer.innerHTML.trim()) headerContainer.innerHTML=headerHTML;
initNav();
}
});
function normalizePath(path){
const normalized=path.replace(/index\.html$/,'').replace(/\.html$/,'').replace(/\/+$/,'');
return normalized||'/';
}
function initNav(){
const hamburger=document.getElementById('hamburger');
const navLinks=document.getElementById('navLinks');
const nav=document.getElementById('nav');
if(hamburger){hamburger.addEventListener('click',()=>{navLinks.classList.toggle('open');});}
window.addEventListener('scroll',()=>{if(nav){nav.classList.toggle('scrolled',window.scrollY>50);}});
const currentPath=normalizePath(window.location.pathname);
const links=navLinks.querySelectorAll('a:not(.nav-cta)');
links.forEach(link=>{
const linkPath=normalizePath(new URL(link.href).pathname);
if(currentPath===linkPath||(currentPath.startsWith('/industries')&&linkPath==='/industries')||(currentPath.startsWith('/blog')&&linkPath==='/blog')){link.classList.add('active');}
});
document.querySelectorAll('a[href^="#"]').forEach(a=>{a.addEventListener('click',e=>{const href=a.getAttribute('href');if(href.startsWith('#')){e.preventDefault();const t=document.querySelector(href);if(t)t.scrollIntoView({behavior:'smooth'});if(navLinks)navLinks.classList.remove('open');}});});
const observer=new IntersectionObserver((entries)=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');observer.unobserve(e.target);}});},{threshold:0.1,rootMargin:'0px 0px -40px 0px'});
document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
document.querySelectorAll('.faq-q').forEach(btn=>{btn.addEventListener('click',()=>{const item=btn.parentElement;document.querySelectorAll('.faq-item').forEach(i=>{if(i!==item)i.classList.remove('open');});item.classList.toggle('open');});});
}
