export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

  const { priceId, licenceTier, couponCode } = req.body;

  try {
    // Look up the price to get the amount
    const price = await stripe.prices.retrieve(priceId);
    let amount = price.unit_amount;
    let discountAmount = 0;
    let couponValid = false;

    // Validate coupon if provided
    if (couponCode) {
      try {
        const promotionCodes = await stripe.promotionCodes.list({
          code: couponCode,
          active: true,
          limit: 1,
        });

        if (promotionCodes.data.length === 0) {
          return res.status(400).json({ error: "Invalid coupon code" });
        }

        const promoCode = promotionCodes.data[0];
        const coupon = promoCode.coupon;

        // Check if coupon applies to this licence tier
        const applicableTier = coupon.metadata?.applicable_tier;

        if (applicableTier && applicableTier !== licenceTier) {
          return res.status(400).json({
            error: `This coupon is only valid for ${applicableTier.toUpperCase()} licences`,
          });
        }

        // Calculate discount
        if (coupon.percent_off) {
          discountAmount = Math.round(amount * (coupon.percent_off / 100));
        } else if (coupon.amount_off) {
          discountAmount = coupon.amount_off;
        }

        amount = Math.max(0, amount - discountAmount);
        couponValid = true;
      } catch (couponError) {
        return res.status(400).json({ error: "Invalid coupon code" });
      }
    }

    // Create the PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      metadata: {
        priceId,
        licenceTier,
        couponCode: couponValid ? couponCode : "",
      },
    });

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      amount,
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    return res.status(500).json({ error: error.message });
  }
}
