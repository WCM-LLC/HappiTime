'use client';

import { useState } from 'react';
import VenueAddressAutocomplete from '@/components/VenueAddressAutocomplete';
import type { VenuePrefill } from '@/app/api/places/details/route';

const inputCls =
  'w-full h-10 rounded-md border border-border bg-background text-body-sm px-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand';

/**
 * "Add a venue" form with Google Places autocomplete. Picking a suggestion
 * prefills every field and carries places_id/lat/lng/phone/website through
 * hidden inputs so the venue is born matched — no waiting for the enrichment
 * cron for the basics. Manual entry stays a first-class path.
 */
export default function AddVenueForm({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [prefill, setPrefill] = useState<VenuePrefill | null>(null);
  const [manual, setManual] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateField, setStateField] = useState('');
  const [zip, setZip] = useState('');

  const showFields = manual || prefill != null;
  const closed = prefill?.businessStatus === 'CLOSED_PERMANENTLY';

  function applyPrefill(p: VenuePrefill) {
    setPrefill(p);
    setName(p.name);
    setAddress(p.address);
    setCity(p.city);
    setStateField(p.state);
    setZip(p.zip);
  }

  return (
    <form className="flex flex-col gap-4">
      <div>
        <label className="text-body-sm font-medium text-foreground block mb-1.5">
          Find the venue on Google
        </label>
        <VenueAddressAutocomplete onResolve={applyPrefill} onManual={() => setManual(true)} />
        <p className="text-caption text-muted-light mt-1">
          Picking a match fills the whole form and links the venue to Google for photo and data sync.
        </p>
      </div>

      {closed && (
        <div className="rounded-md border border-error bg-error-light px-4 py-3">
          <p className="text-body-sm font-medium text-error">
            Google marks this venue as permanently closed.
          </p>
          <p className="text-body-sm text-error/80 mt-0.5">
            Double-check before creating it — closed venues hurt data trust.
          </p>
        </div>
      )}

      {showFields && (
        <>
          <div>
            <label htmlFor="venue-name" className="text-body-sm font-medium text-foreground block mb-1.5">
              Venue name
            </label>
            <input id="venue-name" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Smith's Taproom" required className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="address" className="text-body-sm font-medium text-foreground block mb-1.5">
                Street address
              </label>
              <input id="address" name="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" required className={inputCls} />
            </div>
            <div>
              <label htmlFor="city" className="text-body-sm font-medium text-foreground block mb-1.5">
                City
              </label>
              <input id="city" name="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Kansas City" required className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="state" className="text-body-sm font-medium text-foreground block mb-1.5">
                State
              </label>
              <input id="state" name="state" value={stateField} onChange={(e) => setStateField(e.target.value)} placeholder="MO" required className={inputCls} />
            </div>
            <div>
              <label htmlFor="zip" className="text-body-sm font-medium text-foreground block mb-1.5">
                ZIP code
              </label>
              <input id="zip" name="zip" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="64108" required className={inputCls} />
            </div>
            <div>
              <label htmlFor="timezone" className="text-body-sm font-medium text-foreground block mb-1.5">
                Timezone
              </label>
              <input id="timezone" name="timezone" defaultValue="America/Chicago" className={inputCls} />
            </div>
          </div>

          {/* Places prefill riding along to createVenue */}
          {prefill && (
            <>
              <input type="hidden" name="places_id" value={prefill.placeId} />
              {prefill.lat != null && <input type="hidden" name="lat" value={String(prefill.lat)} />}
              {prefill.lng != null && <input type="hidden" name="lng" value={String(prefill.lng)} />}
              {prefill.phone && <input type="hidden" name="phone" value={prefill.phone} />}
              {prefill.website && <input type="hidden" name="website" value={prefill.website} />}
            </>
          )}

          <div>
            <button
              formAction={action}
              className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-semibold hover:bg-brand-dark transition-colors cursor-pointer"
            >
              Create venue
            </button>
          </div>
        </>
      )}
    </form>
  );
}
