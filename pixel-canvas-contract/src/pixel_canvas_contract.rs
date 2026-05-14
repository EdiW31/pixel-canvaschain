#![no_std]

#[allow(unused_imports)]
use multiversx_sc::imports::*;

// ─── Tier thresholds (in smallest EGLD units = 10^18) ─────────────────────────
// Devnet demo values (production = multiply by 100):
//   Novice:     0.05 xEGLD → 1,000  pixels (baseline)
//   Apprentice: 0.25 xEGLD → 5,500  pixels (+10%)
//   Artisan:    0.50 xEGLD → 12,000 pixels (+20%)
//   Master:     1.25 xEGLD → 32,500 pixels (+30%)
//   Legend:     2.50 xEGLD → 75,000 pixels (+50%)
//
// Base rate: 20,000 pixels per 1 xEGLD
// Bonus percentages are identical to the PDF specification.
// To switch to production values, change the TIER_* constants and redeploy.

const DECIMALS: u64 = 1_000_000_000_000_000_000u64; // 10^18

// Tier thresholds in smallest EGLD units
const TIER_NOVICE: u64     =   50_000_000_000_000_000u64; // 0.05  xEGLD
const TIER_APPRENTICE: u64 =  250_000_000_000_000_000u64; // 0.25  xEGLD
const TIER_ARTISAN: u64    =  500_000_000_000_000_000u64; // 0.50  xEGLD
const TIER_MASTER: u64     = 1_250_000_000_000_000_000u64; // 1.25  xEGLD
const TIER_LEGEND: u64     = 2_500_000_000_000_000_000u64; // 2.50  xEGLD

// Pixels per 1 full xEGLD (base rate, before bonus)
const BASE_PIXELS_PER_EGLD: u64 = 20_000u64;

// Revenue split percentages
const BURN_PCT: u64    = 25u64;
const OWNER_PCT: u64   = 25u64;
const CHARITY_PCT: u64 = 50u64;


#[multiversx_sc::contract]
pub trait PixelCanvasContract {

    // ─── Init / Upgrade ───────────────────────────────────────────────────────

    #[init]
    fn init(&self) {
        // charity_address defaults to the deployer (owner).
        // Call set_charity_address() to point at a real NGO later.
        let deployer = self.blockchain().get_caller();
        self.charity_address().set(&deployer);

        // For the devnet demo, route the "burn" share back to the deployer too.
        // True burn addresses are non-payable and would crash buyPixels mid-tx.
        self.burn_address().set(&deployer);

        self.total_donated().set(BigUint::zero());
    }

    #[upgrade]
    fn upgrade(&self) {}

    // ─── Public payable endpoint: buy pixel credits ───────────────────────────

    #[payable("EGLD")]
    #[endpoint(buyPixels)]
    fn buy_pixels(&self) {
        let payment = self.call_value().egld().clone_value();
        require!(payment >= BigUint::from(TIER_NOVICE), "Payment too low. Minimum is 0.05 xEGLD (Novice tier).");

        let pixels = self.calculate_pixels(&payment);
        let caller = self.blockchain().get_caller();

        self.painting_credits(&caller)
            .update(|credits| *credits += &pixels);

        self.distribute_funds(&payment);

        self.buy_pixels_event(&caller, &payment, &pixels);
    }

    // ─── Owner-only: consume credits (called by backend after each paint) ─────

    #[endpoint(consumeCredits)]
    fn consume_credits(&self, user: ManagedAddress, amount: BigUint) {
        self.require_owner();
        let current = self.painting_credits(&user).get();
        require!(current >= amount, "Insufficient painting credits.");
        self.painting_credits(&user).update(|c| *c -= &amount);
    }

    // ─── Owner-only: update charity address ──────────────────────────────────

    #[endpoint(setCharityAddress)]
    fn set_charity_address_endpoint(&self, new_address: ManagedAddress) {
        self.require_owner();
        self.charity_address().set(&new_address);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    #[view(getPaintingCredits)]
    fn get_painting_credits(&self, user: ManagedAddress) -> BigUint {
        self.painting_credits(&user).get()
    }

    #[view(getCharityAddress)]
    fn get_charity_address(&self) -> ManagedAddress {
        self.charity_address().get()
    }

    #[view(getTotalDonated)]
    fn get_total_donated(&self) -> BigUint {
        self.total_donated().get()
    }

    #[view(getBurnAddress)]
    fn get_burn_address(&self) -> ManagedAddress {
        self.burn_address().get()
    }

    // ─── Storage mappers ──────────────────────────────────────────────────────

    #[storage_mapper("paintingCredits")]
    fn painting_credits(&self, user: &ManagedAddress) -> SingleValueMapper<BigUint>;

    #[storage_mapper("charityAddress")]
    fn charity_address(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("burnAddress")]
    fn burn_address(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("totalDonated")]
    fn total_donated(&self) -> SingleValueMapper<BigUint>;

    // ─── Events ───────────────────────────────────────────────────────────────

    #[event("buyPixels")]
    fn buy_pixels_event(
        &self,
        #[indexed] buyer: &ManagedAddress,
        #[indexed] egld_paid: &BigUint,
        #[indexed] pixels_received: &BigUint,
    );

    // ─── Internal helpers ─────────────────────────────────────────────────────

    fn calculate_pixels(&self, payment: &BigUint) -> BigUint {
        let one_egld = BigUint::from(DECIMALS);
        let base_pixels_per_egld = BigUint::from(BASE_PIXELS_PER_EGLD);

        // Base pixels = payment * BASE_PIXELS_PER_EGLD / 10^18
        let base_pixels = payment * &base_pixels_per_egld / &one_egld;

        let legend_threshold     = BigUint::from(TIER_LEGEND);
        let master_threshold     = BigUint::from(TIER_MASTER);
        let artisan_threshold    = BigUint::from(TIER_ARTISAN);
        let apprentice_threshold = BigUint::from(TIER_APPRENTICE);

        // Apply bonus based on tier
        if payment >= &legend_threshold {
            // +50% bonus
            &base_pixels * 150u64 / 100u64
        } else if payment >= &master_threshold {
            // +30% bonus
            &base_pixels * 130u64 / 100u64
        } else if payment >= &artisan_threshold {
            // +20% bonus
            &base_pixels * 120u64 / 100u64
        } else if payment >= &apprentice_threshold {
            // +10% bonus
            &base_pixels * 110u64 / 100u64
        } else {
            // Novice — no bonus
            base_pixels
        }
    }

    fn distribute_funds(&self, amount: &BigUint) {
        let hundred = BigUint::from(100u64);

        let burn_amount    = amount * BURN_PCT    / &hundred;
        let owner_amount   = amount * OWNER_PCT   / &hundred;
        let charity_amount = amount * CHARITY_PCT / &hundred;

        // 25% → burn sink (unspendable address)
        let burn_addr = self.burn_address().get();
        self.send().direct_egld(&burn_addr, &burn_amount);

        // 25% → contract owner (deployer / treasury)
        let owner_addr = self.blockchain().get_owner_address();
        self.send().direct_egld(&owner_addr, &owner_amount);

        // 50% → charity (placeholder = owner; update via setCharityAddress)
        let charity_addr = self.charity_address().get();
        self.send().direct_egld(&charity_addr, &charity_amount);

        // Track cumulative donations on-chain
        self.total_donated()
            .update(|total| *total += &charity_amount);
    }

    fn require_owner(&self) {
        let caller = self.blockchain().get_caller();
        let owner  = self.blockchain().get_owner_address();
        require!(caller == owner, "Only the contract owner can call this endpoint.");
    }

    fn decode_burn_address(&self) -> ManagedAddress {
        // For the devnet demo, send the "burn" share back to the owner.
        // True burn addresses on MultiversX are non-payable system addresses
        // and reject incoming EGLD transfers (which would crash buyPixels mid-tx).
        // Production version: replace with a proper ESDT burn mechanism.
        self.blockchain().get_owner_address()
    }
}
