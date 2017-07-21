const fs = require('fs')
const toml = require('toml')
const chalk = require('chalk')
const jshiki = require('jshiki')
const datefns = require('date-fns')

const config = toml.parse(fs.readFileSync('config.toml', {encoding: 'utf-8'}))
const transactions = config.transactions || []
const bankFees = config['bank-fees'] || []

function activeDates (transaction, start, end) {
  return jshiki.parse(
    transaction.when,
    {scope: {
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
      sunday: 7,
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
      sun: 7,
      weekly: day => {
        let weeks = datefns.differenceInCalendarISOWeeks(end, start) + 1
        let dates = []
        for (let i = 0; i <= weeks; i++) {
          let date = datefns.addWeeks(start, i)
          dates.push(datefns.setISODay(date, day))
        }
        return dates
      },
      monthly: day => {
        let months = datefns.differenceInMonths(end, start) + 1
        let dates = []
        for (let i = 0; i <= months; i++) {
          let date = datefns.addMonths(start, i)
          dates.push(datefns.setDate(date, day))
        }
        return dates
      },
      firstnotweekend: dates => dates.map(date => {
        while (datefns.isWeekend(date)) {
          date = datefns.addDays(date, 1)
        }
        return date
      }),
      lastnotweekend: dates => dates.map(date => {
        while (datefns.isWeekend(date)) {
          date = datefns.addDays(date, 1)
        }
        return date
      }),
      once: date => [datefns.parse(date)],
      add: function () {
        return Array.from(arguments).reduce((dates1, dates2) => dates1.concat(dates2))
      }
    }}
  ).eval()
}

const startingBalance = Number(process.argv[2])
const start = process.argv[3]
  ? datefns.parse(process.argv[3])
  : new Date()
const end = process.argv[4]
  ? datefns.parse(process.argv[4])
  : datefns.addMonths(start, 1)

const days = datefns.differenceInDays(end, start)
let balance = startingBalance

const calendar = new Map()

transactions.forEach(t => {
  if (t.disabled) {
    return
  }
  activeDates(t, start, end).forEach(d => {
    const key = datefns.format(d, 'YYYY-MM-DD')
    if (!calendar.has(key)) {
      calendar.set(key, [])
    }
    calendar.get(key).push(t)
  })
})

function formatCurrency (amount, padStart, padEnd) {
  let amtStr = amount.toLocaleString('en-US', {style: 'currency', currency: 'USD'})
  if (padStart) {
    amtStr = amtStr.padStart(padStart)
  }
  if (padEnd) {
    amtStr = amtStr.padEnd(padEnd)
  }
  return amount < 0 ? chalk.red(amtStr) : chalk.green(amtStr)
}

const triggeredFees = []
for (let i = 0; i <= days; i++) {
  let currentDate = datefns.addDays(start, i)
  let key = datefns.format(currentDate, 'YYYY-MM-DD')
  if (calendar.has(key)) {
    console.log(chalk.dim(datefns.format(currentDate, 'ddd, D MMMM YYYY')))
    let expensesMade = false
    calendar.get(key).forEach(t => {
      console.log(`TRX:    ${formatCurrency(t.amount, 12)}  ${t.name.padEnd(30)}  ${t.entity || ''}`)
      balance += t.amount
      if (t.amount < 0) {
        expensesMade = true
      }
    })
    bankFees.forEach(f => {
      const triggered = jshiki.parse(f['if'], {scope: {
        balance,
        date: currentDate,
        expensesMade,
        alreadyTriggered: forDay => triggeredFees.some(tf =>
          tf.fee.name === f.name && tf.fee.entity === f.entity && (forDay
            ? (
              datefns.getDate(date) === datefns.getDate(tf.date) &&
              datefns.getMonth(date) === datefns.getMonth(tf.date) &&
              datefns.getYear(date) === datefns.getYear(tf.date)
            )
            : true
          )
        )
      }}).eval()
      if (triggered) {
        triggeredFees.push({date: currentDate, fee: f})
        console.log(`${chalk.red('FEE:')}    ${formatCurrency(f.amount, 12)}  ${f.name.padEnd(30)}  ${f.entity || ''}`)
      }
    })
    console.log(chalk.dim('Ending: ') + chalk.bold(formatCurrency(balance, 12)))
    console.log()
  }
}
