import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabaseClient'
import { useAuthStore } from '../store/authStore'
import { todayISO } from '../lib/date'
import { suggestCategory } from '../lib/categorise'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import './ItemForm.css'

const UNITS = ['pcs', 'g', 'kg', 'ml', 'l', 'packs']

/** Small tag marking a field that Voice/OCR filled in rather than the user. */
function DetectedTag() {
  return <span className="detected-tag">detected</span>
}

/**
 * Reusable add/verify form -- shared by Module 3 (Manual Entry) and Module 7
 * (Verify Details), which pre-fills it from Voice/OCR output via
 * `initialValues` and flags those fields via `detectedFields`. Keep this
 * component ignorant of navigation; callers decide what happens after a save
 * via `onSaved`.
 */
export default function ItemForm({
  initialValues = {},
  detectedFields = {},
  inputMethod = 'manual',
  submitLabel = 'Save item',
  onSaved,
}) {
  const session = useAuthStore((s) => s.session)
  const online = useOnlineStatus()
  const [categories, setCategories] = useState([])
  const [categoriesError, setCategoriesError] = useState('')
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    let cancelled = false

    supabase
      .from('categories')
      .select('id, name')
      .order('id')
      .then(({ data, error }) => {
        if (cancelled) return
        // Without this, a failed fetch is indistinguishable from "there are no
        // categories" -- the dropdown just quietly offers Uncategorized only.
        if (error) setCategoriesError("Couldn't load categories.")
        else setCategories(data ?? [])
      })

    return () => {
      cancelled = true
    }
  }, [])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      name: initialValues.name ?? '',
      quantity: initialValues.quantity ?? '',
      unit: initialValues.unit ?? UNITS[0],
      category_id: initialValues.category_id ?? '',
      expiry_date: initialValues.expiry_date ?? '',
    },
  })

  const expiryDate = watch('expiry_date')
  const isPastExpiry = expiryDate && expiryDate < todayISO()

  const name = watch('name')

  // Refs, not state: these gate the effect below, and holding them as state
  // would put them in its dependency list and re-trigger the thing they exist
  // to suppress.
  const categoryTouched = useRef(Boolean(initialValues.category_id))
  const categoryWasAuto = useRef(false)
  const [categoryAuto, setCategoryAuto] = useState(false)

  // Fills the category in from the name. Keyed on the *watched* value rather
  // than hung off an onChange handler, which matters more than it looks: with
  // Voice and OCR the user never types, so the name arrives as a defaultValue
  // and no change event ever fires. An onChange version would work when typing
  // and be silently dead on exactly those two paths.
  useEffect(() => {
    if (categoryTouched.current) return
    // Nothing to map a name onto until the fetch lands, so this re-runs when
    // `categories` arrives.
    if (categories.length === 0) return

    const suggested = suggestCategory(name)
    const match = suggested
      ? categories.find((c) => c.name.toLowerCase() === suggested.toLowerCase())
      : null

    if (match) {
      setValue('category_id', String(match.id))
      categoryWasAuto.current = true
      setCategoryAuto(true)
    } else if (categoryWasAuto.current) {
      // The name was edited into something unrecognised. Clear our own earlier
      // guess rather than leaving a stale category attached to a new item.
      setValue('category_id', '')
      categoryWasAuto.current = false
      setCategoryAuto(false)
    }
  }, [name, categories, setValue])

  const onSubmit = async (values) => {
    setSubmitError('')

    // Checked before the request rather than after: offline, the Supabase call
    // fails with a generic network error that tells the user nothing about
    // why. Saving is deliberately not queued -- an item that silently vanishes
    // is worse than one that plainly refused to save.
    if (!online) {
      setSubmitError('You’re offline — this item can’t be saved until you reconnect.')
      return
    }

    const { data, error } = await supabase
      .from('inventory_items')
      .insert({
        user_id: session.user.id,
        name: values.name.trim(),
        quantity: Number(values.quantity),
        unit: values.unit,
        category_id: values.category_id || null,
        expiry_date: values.expiry_date,
        input_method: inputMethod,
        status: 'active',
      })
      .select()
      .single()

    if (error) {
      setSubmitError(error.message)
      return
    }

    onSaved?.(data)
  }

  return (
    <form className="item-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {/* Shown up front, not on submit -- filling in a whole form before being
          told it can't be saved is a poor way to find out. */}
      {!online && (
        <p className="form-banner offline-banner">
          You’re offline. You can fill this in, but it won’t save until you reconnect.
        </p>
      )}

      <label className="field">
        <span>
          Name
          {detectedFields.name && <DetectedTag />}
        </span>
        <input
          type="text"
          placeholder="e.g. Amul milk"
          {...register('name', { required: 'Name is required' })}
        />
        {errors.name && <p className="field-error">{errors.name.message}</p>}
      </label>

      {/* Above quantity on purpose: the expiry date is the entire point of the
          app, so it comes straight after the name rather than last. */}
      <label className="field">
        <span>
          Expiry date
          {detectedFields.expiry_date && <DetectedTag />}
        </span>
        <input type="date" {...register('expiry_date', { required: 'Expiry date is required' })} />
        {errors.expiry_date && <p className="field-error">{errors.expiry_date.message}</p>}
        {/* Soft warning only -- some items are deliberately logged already expired. */}
        {!errors.expiry_date && isPastExpiry && (
          <p className="field-warning">This date is in the past.</p>
        )}
      </label>

      <div className="field-row">
        <label className="field">
          <span>
            Quantity
            {detectedFields.quantity && <DetectedTag />}
          </span>
          <input
            type="number"
            step="any"
            inputMode="decimal"
            placeholder="1"
            {...register('quantity', {
              required: 'Required',
              validate: (v) => Number(v) > 0 || 'Must be greater than 0',
            })}
          />
          {errors.quantity && <p className="field-error">{errors.quantity.message}</p>}
        </label>

        <label className="field">
          <span>
            Unit
            {detectedFields.unit && <DetectedTag />}
          </span>
          <select {...register('unit', { required: true })}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>
          Category
          {(categoryAuto || detectedFields.category_id) && <DetectedTag />}
        </span>
        <select
          {...register('category_id', {
            // Once the user picks for themselves, stop guessing -- for good.
            // An auto-fill that overwrites a deliberate choice is worse than
            // no auto-fill at all.
            onChange: () => {
              categoryTouched.current = true
              categoryWasAuto.current = false
              setCategoryAuto(false)
            },
          })}
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {categoriesError && <p className="field-error">{categoriesError}</p>}
      </label>

      {submitError && <p className="form-banner error">{submitError}</p>}

      <button type="submit" className="btn-primary" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
