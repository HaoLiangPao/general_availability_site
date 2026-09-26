# Stripe Setup Guide

To accept payments for Ski Lessons, you'll need to enable and configure Stripe in this project. Follow these steps:

## 1. Create a Stripe Account
1. Go to [Stripe.com](https://stripe.com/) and create an account.
2. Complete your account details and business profile.
3. Access your Stripe Dashboard.

## 2. Get Your API Keys
1. In the Stripe Dashboard, navigate to **Developers** > **API keys**.
2. Make sure you are in **Test Mode** initially (toggle at the top right).
3. Copy your **Publishable key** (`pk_test_...`) and your **Secret key** (`sk_test_...`).

## 3. Configure Local Environment Variables
1. Open the `.env.local` file located in the root of your project.
2. Add the following environment variables. Replace the placeholder values with your actual Stripe API keys:
   ```env
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY
   STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY
   ```

## 4. Install Stripe Dependencies
You will need to install the Stripe SDKs for both the frontend and backend.
Run the following command in your terminal:
```bash
npm install stripe @stripe/stripe-js
```

## 5. Next Steps for Full Integration
Currently, the site captures the chosen payment method and attaches it to the booking notes. To execute real payments dynamically:
1. Create a new Checkout API Route (e.g., `src/app/api/checkout/route.ts`) that initiates a Stripe Checkout Session using the backend `stripe` SDK.
2. Refactor the `handleSubmit` process in the booking page to redirect users to the Stripe Checkout page if `paymentMethod === 'stripe'`.
3. Set up a Webhook API Route to verify the success of the payment and officially lock the booking in your database/calendar.

## Transitioning to Live Mode
When you are ready to accept real payments, toggle out of Test Mode in your Stripe Dashboard, grab your **Live** API keys, and update your `.env.local` or exact environment variables on your hosting platform (e.g., Vercel).
