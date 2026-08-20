import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabaseClient'
import { useAuthStore } from '../store/authStore'
import './ItemForm.css'

const UNITS = ['pcs', 'g', 'kg', 'ml', 'l', 'packs']

function todayISO() {
  // Local calendar date, not UTC -- new Date().toISOString() would drift a
  // day around midnight in IST. expiry_date is a `date` column on purpose
  // (see supabase/002_hardening.sql), so this stays a plain y-m-d string.
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Reusable add/verify form -- shared by Module 3 (Manual Entry) and, later,
 * Module 7 (Verify Details) which pre-fills this same form from Voice/OCR
 * output via `initialValues`. Keep this component ignorant of navigation;
 * callers decide what happens after a save via `onSaved`.
 */
export default function ItemForm({ initialValues = {}, inputMethod = 'manual', onSaved }) {
  const session = useAuthStore((s) => s.session)
  const [categories, setCategories] = useState([])
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    supabase
      .from('categories')
      .select('id, name')
      .order('id')
      .then(({ data }) => setCategories(data ?? []))
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
        <span>Name</span>
        <input
          type="text"
          placeholder="e.g. Amul milk"
          {...register('name', { required: 'Name is required' })}
        />
        {errors.name && <p className="field-error">{errors.name.message}</p>}
        {/* Voice/OCR (Module 7) will tag pre-filled fields here; manual entry has nothing to tag. */}
      </label>

      <div className="field-row">
        <label className="field">
          <span>Quantity</span>
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
          <span>Unit</span>
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
      </label>

      <label className="field">
        <span>Expiry date</span>
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
        {isSubmitting ? 'Saving…' : 'Save item'}
      </button>
    </form>
  )
}
