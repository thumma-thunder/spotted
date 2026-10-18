import { icon } from '../ui.js';

export default function home(view) {
  view.innerHTML = `
  <section class="hero">
    <div class="hero-inner">
      <h1>More Parking. Less Stress.</h1>
      <p>Connect with local homeowners and university commuters for affordable, reliable parking near campus.</p>
      <div class="hero-cta">
        <a class="btn btn-primary btn-lg" href="#/find">Find a Spot</a>
        <a class="btn btn-light btn-lg" href="#/list">Become a Host</a>
      </div>
    </div>
    <svg class="hero-wave" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true"><path d="M0 52C220 92 420 96 720 58S1200 4 1440 40V90H0Z" fill="#F6F8FC"/></svg>
  </section>

  <section class="features" aria-label="Why Spotted">
    <div class="feature">${icon('piggy')}<h3>Affordable</h3><p>Save money with flexible, competitive rates.</p></div>
    <div class="feature">${icon('shield')}<h3>Reliable</h3><p>Reserved spaces and a clear payment trail.</p></div>
    <div class="feature">${icon('clock')}<h3>Flexible</h3><p>Daily, weekly, monthly, and game day parking.</p></div>
  </section>

  <section class="how">
    <div class="how-inner">
      <h2>How It Works</h2>
      <div class="steps">
        <div class="step"><div class="num">1</div><h3>Find a Spot</h3><p>Search available parking near campus.</p></div>
        <div class="step"><div class="num">2</div><h3>Book &amp; Pay</h3><p>Reserve online and pay the host with Venmo.</p></div>
        <div class="step"><div class="num">3</div><h3>Park &amp; Go</h3><p>Show up, park and walk to class.</p></div>
      </div>
    </div>
  </section>

  <section class="split">
    <div class="card">
      <span class="eyebrow">Commuters</span>
      <h3>No parking pass? No problem.</h3>
      <p>Book a driveway near campus by the day, week, month or for a CU game.</p>
      <a class="btn btn-primary btn-sm" href="#/find">Search parking</a>
    </div>
    <div class="card">
      <span class="eyebrow">Homeowners</span>
      <h3>Your driveway. Their spot.</h3>
      <p>Turn space that sits empty during class hours into extra income, paid straight to your Venmo.</p>
      <a class="btn btn-outline btn-sm" href="#/list">List your spot</a>
    </div>
  </section>`;
}
