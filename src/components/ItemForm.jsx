import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabaseClient'
import { useAuthStore } from '../store/authStore'
import { todayISO } from '../lib/date'
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

  const onSubmit = async (values) => {
    setSubmitError('')

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
        <span>Category</span>
        <select {...register('category_id')}>
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {categoriesError && <p className="field-error">{categoriesError}</p>}
      </label>

      <label className="field">
        <span>
          Expiry date
          {detectedFields.expiry_date && <DetectedTag />}
        </span>
        <input
          type="date"
          {...register('expiry_date', { required: 'Expiry date is required' })}
        />
        {errors.expiry_date && <p className="field-error">{errors.expiry_date.message}</p>}
        {/* Soft warning only -- some items are deliberately logged already expired. */}
        {!errors.expiry_date && isPastExpiry && (
          <p className="field-warning">This date is in the past.</p>
        )}
      </label>

      {submitError && <p className="form-banner error">{submitError}</p>}

      <button type="submit" className="btn-primary" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
