/**
 * Curated terminal name abbreviations for G2 glasses display.
 * Keys are exact MTA terminal names (as they appear in GTFS-RT trip headsigns).
 * Values are short, rider-recognizable abbreviations (max ~14 chars).
 * Used by formatTrainLine() before falling back to character truncation.
 */
export const TERMINAL_ABBREVS: Record<string, string> = {
  // A/C/E
  'Inwood-207 St':                    'Inwood',
  'Far Rockaway-Mott Av':             'Far Rockaway',
  'Ozone Park-Lefferts Blvd':         'Lefferts Blvd',
  'Rockaway Park-Beach 116 St':       'Rockaway Pk',
  'World Trade Center':               'WTC',
  'Euclid Av':                        'Euclid Av',

  // B/D/F/M
  'Norwood-205 St':                   'Norwood',
  'Bedford Pk Blvd-Lehman College':   'Bedford Pk',
  'Coney Island-Stillwell Av':        'Coney Island',
  'Brighton Beach':                   'Brighton Bch',
  'Bay Ridge-95 St':                  'Bay Ridge',
  'Forest Hills-71 Av':               'Forest Hills',
  'Jamaica-179 St':                   'Jamaica-179',
  'Middle Village-Metropolitan Av':   'Middle Village',

  // G
  'Church Av':                        'Church Av',
  'Court Sq':                         'Court Sq',

  // J/Z
  'Jamaica Center-Parsons/Archer':    'Jamaica Ctr',
  'Broad St':                         'Broad St',

  // N/Q/R/W
  'Astoria-Ditmars Blvd':             'Ditmars Blvd',
  'Astoria-Ditmars':                  'Ditmars Blvd',
  'Forest Hills - 71 Av':            'Forest Hills',
  'Whitehall St-South Ferry':         'South Ferry',
  '96 St':                            '96 St',
  'Bay Ridge Av':                     'Bay Ridge Av',
  'Stillwell Av':                     'Coney Island',

  // L
  'Canarsie-Rockaway Pkwy':           'Canarsie',
  '8 Av':                             '8 Av',

  // 1/2/3
  'Van Cortlandt Park-242 St':        'Van Cortlandt',
  'Wakefield-241 St':                 'Wakefield',
  'Flatbush Av-Brooklyn College':     'Flatbush Av',
  'New Lots Av':                      'New Lots Av',
  'Penn Station':                     'Penn Sta',
  'South Ferry':                      'South Ferry',

  // 4/5/6
  'Woodlawn':                         'Woodlawn',
  'Eastchester-Dyre Av':              'Eastchester',
  'Pelham Bay Park':                  'Pelham Bay',
  'Crown Hts-Utica Av':               'Crown Hts',
  'Flatbush Av':                      'Flatbush Av',
  'Bowling Green':                    'Bowling Green',

  // 7
  'Flushing-Main St':                 'Flushing',
  '34 St-Hudson Yards':               'Hudson Yards',

  // Shared / common
  'Atlantic Av-Barclays Ctr':         'Atlantic Av',
  '59 St-Columbus Circle':            'Columbus Cir',
  'Sutphin Blvd-Archer Av-JFK Airport': 'Sutphin/JFK',
  'Jamaica Center':                   'Jamaica Ctr',
  'Howard Beach-JFK Airport':         'Howard Bch',
  '145 St':                           '145 St',
  '168 St':                           '168 St',
  'Harlem-148 St':                    'Harlem-148',
}
