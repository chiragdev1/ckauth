import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { describeError, type FieldErrors } from './validation.ts'

type Validator<F extends string> = (value: string, values: Record<F, string>) => string | undefined

type Options<F extends string> = {
  initial: Record<F, string>
  validate?: Partial<Record<F, Validator<F>>>
  submit: (values: Record<F, string>) => Promise<void>
}

// one place for every form's behaviour: errors appear once a field is left (or on submit), then update as the user types,
// and api failures land on the field they belong to instead of one vague banner
export function useForm<F extends string>({ initial, validate = {}, submit }: Options<F>) {
  const [values, setValues] = useState(initial)
  const [touched, setTouched] = useState<Partial<Record<F, boolean>>>({})
  const [serverErrors, setServerErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const validators = validate as Partial<Record<F, Validator<F>>>
  const fieldNames = Object.keys(initial) as F[]

  function errorFor(name: F, current = values) {
    return validators[name]?.(current[name], current)
  }

  // client errors win, since they describe what's in the box right now; a server error clears when the field changes
  const errors = {} as Partial<Record<F, string>>
  for(const name of fieldNames) {
    const error = (touched[name] ? errorFor(name) : undefined) ?? serverErrors[name]
    if(error) errors[name] = error
  }

  function register(name: F) {
    return {
      name,
      id: name,
      value: values[name],
      // aria-describedby is set by the field (components/form.tsx), which knows its hint and requirements too
      'aria-invalid': errors[name] ? true : undefined,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        setValues(previous => ({ ...previous, [name]: event.target.value }))
        setServerErrors(({ [name]: _dropped, ...rest }) => rest)
      },
      onBlur: () => setTouched(previous => ({ ...previous, [name]: true })),
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTouched(Object.fromEntries(fieldNames.map(name => [name, true])) as Record<F, boolean>)
    setFormError(null)

    const firstInvalid = fieldNames.find(name => errorFor(name))
    if(firstInvalid) {
      formRef.current?.querySelector<HTMLInputElement>(`[name="${firstInvalid}"]`)?.focus()
      return
    }

    setPending(true)
    try {
      await submit(values)
    } catch (caught) {
      const { formError, fieldErrors } = describeError(caught)
      setFormError(formError)
      setServerErrors(fieldErrors)
    } finally {
      setPending(false)
    }
  }

  function reset() {
    setValues(initial)
    setTouched({})
    setServerErrors({})
  }

  return { values, errors, formError, setFormError, pending, register, onSubmit, reset, formRef }
}
