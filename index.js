#!/usr/bin/env node

const fs = require('fs')
const ukaz = require('ukaz')
const toml = require('toml')
const chalk = require('chalk')
const jshiki = require('jshiki')
const datefns = require('date-fns')

const debug = Boolean(process.env.DEBUG)

const app = new ukaz.Application('Simple bank transaction simulator')
  .helpFlag()
  .validate()
  .arguments('<starting balance> [start date] [end date]')
  .option('-c, --config <config.toml>', 'Path to the config file. Defaults to `config.toml`.', {
    default: 'config.toml'
  })
  .handler(async ({flags, options, args}) => {
    if (!args.startingBalance.present) {
      throw new ApplicationError('Starting balance is required. Use -h or --help for usage.')
    }
    const config = toml.parse(fs.readFileSync(options.config.value, {encoding: 'utf-8'}))
    const transactions = config.transactions || []
    const bankFees = config['bank-fees'] || []

    const startingBalance = Number(args.startingBalance.value)
    const start = args.startDate.present
      ? datefns.parse(args.startDate.value)
      : new Date()
    start.setHours(0, 0, 0, 0)
    const end = args.endDate.present
      ? datefns.parse(args.endDate.value)
      : datefns.addMonths(start, 1)
    end.setHours(0, 0, 0, 0)

    const days = datefns.differenceInDays(end, start)
    let balance = startingBalance

    const calendar = new Map()

    transactions.forEach(t => {
      if (t.disabled) {
        return
      }
      activeDates(t, start, end).forEach(d => {
        debug && console.log(`add '${t.name}' for date ${d} (${datefns.format(d, 'YYYY-MM-DD')})`)
        if (!calendar.has(d)) {
          calendar.set(d, new Set())
        }
        calendar.get(d).add(t)
      })
    })
    console.log(chalk.dim('Starting: ') + chalk.bold(formatCurrency(balance, 12)))
    console.log()

    const triggeredFees = []
    for (let i = 0; i <= days; i++) {
      let currentDate = datefns.addDays(start, i)
      let key = currentDate.getTime()
      if (calendar.has(key)) {
        console.log(chalk.dim(datefns.format(currentDate, 'ddd, D MMMM YYYY')))
        let expensesMade = false
        calendar.get(key).forEach(t => {
          console.log(`TRX:      ${formatCurrency(t.amount, 12)}  ${t.name.padEnd(30)}  ${t.entity || ''}`)
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
                  datefns.getDate(currentDate) === datefns.getDate(tf.date) &&
                  datefns.getMonth(currentDate) === datefns.getMonth(tf.date) &&
                  datefns.getYear(currentDate) === datefns.getYear(tf.date)
                )
                : true
              )
            )
          }}).eval()
          if (triggered) {
            triggeredFees.push({date: currentDate, fee: f})
            console.log(`${chalk.red('FEE:')}      ${formatCurrency(f.amount, 12)}  ${f.name.padEnd(30)}  ${f.entity || ''}`)
          }
        })
        console.log(chalk.dim('Ending:   ') + chalk.bold(formatCurrency(balance, 12)))
        console.log()
      }
    }
  })

class ApplicationError extends Error { }

app.run(process.argv)
  .catch(err => { // catches any errors encountered during execution
    if (err instanceof ukaz.CliParsingError || err instanceof ApplicationError) {
      console.error(`Error: ${err.message}`)
    } else { // unexpected error
      console.error(err)
    }
  })

function activeDates (transaction, start, end) {
  debug && console.log(`activeDates(${transaction.name}, ${datefns.format(start, 'YYYY-MM-DD')}, ${datefns.format(end, 'YYYY-MM-DD')})`)
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
        debug && console.log(`weekly(${day})`)
        let weeks = datefns.differenceInCalendarISOWeeks(end, start) + 1
        let dates = new Set()
        for (let i = 0; i <= weeks; i++) {
          let date = datefns.addWeeks(start, i)
          dates.add(datefns.setISODay(date, day).getTime())
        }
        return dates
      },
      monthly: day => {
        debug && console.log(`monthly(${day})`)
        let months = datefns.differenceInMonths(end, start) + 1
        let dates = new Set()
        for (let i = 0; i <= months; i++) {
          let date = datefns.addMonths(start, i)
          dates.add(datefns.setDate(date, day).getTime())
        }
        return dates
      },
      firstnotweekend: dates => {
        debug && console.log(`firstnotweekend(${[...dates].join(', ')})`)
        dates.forEach(date => {
          let newDate = date
          while (datefns.isWeekend(newDate)) {
            debug && console.log(`  date ${newDate} (${datefns.format(newDate, 'YYYY-MM-DD')}) is weekend, rolling forward 1 day`)
            newDate = datefns.addDays(newDate, 1)
          }
          newDate = newDate.getTime ? newDate.getTime() : newDate
          if (newDate !== date) {
            debug && console.log(`  set to weekday ${newDate} (${datefns.format(newDate, 'YYYY-MM-DD')})`)
            dates.delete(date)
            dates.add(newDate)
          }
        })
        return dates
      },
      lastnotweekend: dates => {
        debug && console.log(`lastnotweekend(${[...dates].join(', ')})`)
        dates.forEach(date => {
          let newDate = date
          while (datefns.isWeekend(newDate)) {
            debug && console.log(`  date ${newDate} (${datefns.format(newDate, 'YYYY-MM-DD')}) is weekend, rolling back 1 day`)
            newDate = datefns.subDays(newDate, 1)
          }
          newDate = newDate.getTime ? newDate.getTime() : newDate
          if (newDate !== date) {
            debug && console.log(`  set to weekday ${newDate} (${datefns.format(newDate, 'YYYY-MM-DD')})`)
            dates.delete(date)
            dates.add(newDate)
          }
        })
        return dates
      },
      once: date => {
        debug && console.log(`once(${date})`)
        date = datefns.parse(date)
        date.setHours(0, 0, 0, 0)
        return new Set([date.getTime()])
      },
      add: function () {
        debug && console.log(`add(${Array.from(arguments).join(', ')})`)
        return Array.from(arguments).reduce((dates1, dates2) => {
          for (const date of dates2) {
            debug && console.log(`  removing date ${date} (${datefns.format(date, 'YYYY-MM-DD')})`)
            dates1.add(date)
          }
          return dates1
        })
      },
      sub: function () {
        debug && console.log(`sub(${Array.from(arguments).join(', ')})`)
        return Array.from(arguments).reduce((dates1, dates2) => {
          for (const date of dates2) {
            debug && console.log(`  removing date ${date} (${datefns.format(date, 'YYYY-MM-DD')})`)
            dates1.delete(date)
          }
          return dates1
        })
      },
      after: (dates, afterDate) => {
        debug && console.log(`after([${[...dates].join(', ')}], ${afterDate})`)
        dates.forEach(d => {
          if (!datefns.isAfter(d, afterDate)) {
            debug && console.log(`  removing date ${d} (${datefns.format(d, 'YYYY-MM-DD')})`)
            dates.delete(d)
          }
        })
        return dates
      },
      before: (dates, beforeDate) => {
        debug && console.log(`before([${[...dates].join(', ')}], ${beforeDate})`)
        dates.forEach(d => {
          if (!datefns.isBefore(d, beforeDate)) {
            debug && console.log(`  removing date ${d} (${datefns.format(d, 'YYYY-MM-DD')})`)
            dates.delete(d)
          }
        })
        return dates
      }
    }}
  ).eval()
}

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
