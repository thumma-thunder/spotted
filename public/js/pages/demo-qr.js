import { icon } from '../ui.js';

export default function demoQr(view) {
  view.innerHTML = `<section class="page narrow"><div class="card empty">${icon('qr')}
    <h2>This was a demo payment QR</h2>
    <p>On the live Spotted site, scanning the code opens Spotted's Venmo with the amount and the booking code already filled in. No money was sent.</p>
    <a class="btn btn-primary" href="#/bookings">Back to bookings</a></div></section>`;
}
