import { describe, expect, it } from 'vitest';
import { cityAndState, parseAddressParts } from '@/lib/address-parts';

describe('parseAddressParts', () => {
  it('reads a Canadian address with a postal code (the Calgary load)', () => {
    expect(parseAddressParts('Refrigerative Supply, 5543 72nd Ave SE #14, Calgary, AB T2C 3C4')).toEqual({
      street: '5543 72nd Ave SE #14',
      city: 'Calgary',
      state: 'AB',
      postal: 'T2C 3C4',
      country: 'ca',
    });
  });

  it('reads every stop on the Fort Smith to Calgary load', () => {
    expect(parseAddressParts('Comfort Air Distribution, Comfort Air Distribution, 15501 E Fremont Dr, Centennial, CO 80112-6906')).toMatchObject({ street: '15501 E Fremont Dr', city: 'Centennial', state: 'CO', postal: '80112', country: 'us' });
    expect(parseAddressParts('R S D, R S D, 20 Moore Lane, Billings, MT 59101')).toMatchObject({ street: '20 Moore Lane', city: 'Billings', state: 'MT', country: 'us' });
    expect(parseAddressParts('Glacier Supply, Glacier Supply, 6667 Lynx Lane, Bozeman, MT 59718')).toMatchObject({ street: '6667 Lynx Lane', city: 'Bozeman', state: 'MT', country: 'us' });
    expect(parseAddressParts('B A Robinson, B A Robinson, 9055 Innovation Ave SE, Calgary, AB T3S 0B5')).toMatchObject({ street: '9055 Innovation Ave SE', city: 'Calgary', state: 'AB', postal: 'T3S 0B5', country: 'ca' });
  });

  it('tidies the postal code and handles other provinces', () => {
    expect(parseAddressParts('Yard, 10 Front St W, Toronto, ON m5j2n4')).toMatchObject({ city: 'Toronto', state: 'ON', postal: 'M5J 2N4', country: 'ca' });
    expect(parseAddressParts('Dock, 1 Main St, Winnipeg, MB R3C-1A1')).toMatchObject({ state: 'MB', postal: 'R3C 1A1', country: 'ca' });
    expect(parseAddressParts('1 Rue Saint-Jacques, Montreal QC H2Y 1K9')).toMatchObject({ city: '1 Rue Saint-Jacques', state: 'QC', country: 'ca' });
  });

  it('still reads US addresses exactly as before', () => {
    expect(parseAddressParts('Set Epes Yard, 4455 Lansing Dr, Winston Salem, NC 27105-2924')).toEqual({
      street: '4455 Lansing Dr',
      city: 'Winston Salem',
      state: 'NC',
      postal: '27105',
      country: 'us',
    });
    expect(parseAddressParts('Fort Smith, AR')).toMatchObject({ city: 'Fort Smith', state: 'AR', country: 'us' });
  });

  it('gives up cleanly when there is no state or province', () => {
    expect(parseAddressParts('Somewhere nice')).toEqual({});
    expect(parseAddressParts('Nowhere, Nothing here')).toEqual({});
  });
});

describe('cityAndState', () => {
  it('returns the city, region and country for a centroid lookup', () => {
    expect(cityAndState('Calgary, AB T2C 3C4')).toEqual({ city: 'Calgary', state: 'AB', country: 'ca' });
    expect(cityAndState('Dallas, TX 75201')).toEqual({ city: 'Dallas', state: 'TX', country: 'us' });
    expect(cityAndState('no address here')).toBeNull();
  });
});
