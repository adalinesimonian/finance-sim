# finance-sim

A simple simulator which simulates what will happen to your bank account on a daily basis given a certain set of transactions and bank fees.

## Usage

First, install `finance-sim`:

```bash
npm i -g finance-sim
```

Then, add your transactions and bank fees to `config.toml`. Here's an example:

```toml
[[bank-fees]]
name   = "Overdraft Fee"
entity = "Chase Bank"
amount = -34
if     = "balance < 0 && expensesMade"

[[transactions]]
name   = "My Paycheque"
entity = "ACME, Co."
amount = 2000
when   = "firstnotweekend(monthly(20))"

[[transactions]]
name   = "Rent"
entity = "My Landlord"
amount = -1500
when   = "monthly(1)"
```

Then run the script:

```bash
# finance-sim <starting balance> [start date] [end date]

finance-sim 3400 2017-1-1 2017-2-1
```

And you'll get output much like this:

```
Sun, 1 January 2017
TRX:      -$1,500.00  Rent                            My Landlord
Ending:    $1,900.00

Fri, 20 January 2017
TRX:       $2,000.00  My Paycheque                    ACME, Co.
Ending:    $3,900.00

Wed, 1 February 2017
TRX:      -$1,500.00  Rent                            My Landlord
Ending:    $2,400.00
```

Run `finance-sim --help` to see more command-line options.

## Licence

MIT
