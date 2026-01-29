'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, CheckCircle2, Mail, Loader2 } from 'lucide-react';
import { getPropertyNames } from '@/lib/properties';

const PROPERTIES = getPropertyNames();

const UNIT_TYPES = ['Studio', '1BR', '2BR', '3BR', '4BR'];
const FLOOR_PREFERENCES = ['Ground', 'Middle', 'Top', 'No Preference'];

type FormStep = 'form' | 'verify' | 'success';

export default function JoinWaitlistPage() {
  const [step, setStep] = useState<FormStep>('form');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  
  // Form data
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    property: '',
    unit_type_pref: [] as string[],
    floor_pref: 'No Preference',
    max_budget: '',
    move_in_date: '',
    move_in_date_end: '',
    notes: '',
  });
  const [useDateRange, setUseDateRange] = useState(false);
  
  // Verification
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingId, setPendingId] = useState('');
  const [verificationError, setVerificationError] = useState('');

  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    if (!formData.full_name.trim()) errors.full_name = 'Full name is required';
    if (!formData.email.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'Invalid email address';
    // Phone is optional
    if (!formData.property) errors.property = 'Property is required';
    if (formData.unit_type_pref.length === 0) errors.unit_type_pref = 'Select at least one unit type';
    if (!formData.move_in_date) errors.move_in_date = 'Move-in date is required';
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSendVerification = async () => {
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/waitlist/public/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          unit_type_pref: formData.unit_type_pref.join(', '),
          move_in_date_end: useDateRange ? formData.move_in_date_end : null,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to send verification');
      }
      
      setPendingId(result.pendingId);
      setStep('verify');
    } catch (error) {
      console.error('Error sending verification:', error);
      alert('Failed to send verification email. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyAndSubmit = async () => {
    if (!verificationCode.trim()) {
      setVerificationError('Please enter the verification code');
      return;
    }
    
    setIsSubmitting(true);
    setVerificationError('');
    
    try {
      const response = await fetch('/api/waitlist/public/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pendingId,
          code: verificationCode.trim(),
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        setVerificationError(result.error || 'Invalid verification code');
        return;
      }
      
      setStep('success');
    } catch (error) {
      console.error('Error verifying:', error);
      setVerificationError('Failed to verify. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/waitlist/public/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingId }),
      });
      
      if (response.ok) {
        alert('Verification code resent! Check your email.');
      } else {
        alert('Failed to resend code. Please try again.');
      }
    } catch (error) {
      console.error('Error resending:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Form Step
  if (step === 'form') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <img src="/highpoint-logo.png" alt="Highpoint Living" className="h-16 w-auto" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Join Our Waitlist
            </h1>
            <p className="text-muted-foreground mt-2">
              No units available right now? Join our waitlist and our leasing team will reach out when a matching unit becomes available.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Your Information</CardTitle>
              <CardDescription>
                Fill out the form below to be added to our waitlist. We&apos;ll send you a verification email to confirm.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Name & Email */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="full_name">Full Name *</Label>
                  <Input
                    id="full_name"
                    value={formData.full_name}
                    onChange={(e) => {
                      setFormData({ ...formData, full_name: e.target.value });
                      setValidationErrors({ ...validationErrors, full_name: '' });
                    }}
                    placeholder="John Smith"
                    className={validationErrors.full_name ? 'border-red-500' : ''}
                  />
                  {validationErrors.full_name && (
                    <p className="text-sm text-red-500 mt-1">{validationErrors.full_name}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      setValidationErrors({ ...validationErrors, email: '' });
                    }}
                    placeholder="john@example.com"
                    className={validationErrors.email ? 'border-red-500' : ''}
                  />
                  {validationErrors.email && (
                    <p className="text-sm text-red-500 mt-1">{validationErrors.email}</p>
                  )}
                </div>
              </div>

              {/* Phone & Property */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => {
                      setFormData({ ...formData, phone: e.target.value });
                      setValidationErrors({ ...validationErrors, phone: '' });
                    }}
                    placeholder="(555) 123-4567"
                    className={validationErrors.phone ? 'border-red-500' : ''}
                  />
                  {validationErrors.phone && (
                    <p className="text-sm text-red-500 mt-1">{validationErrors.phone}</p>
                  )}
                </div>
                <div>
                  <Label>Property *</Label>
                  <Select
                    value={formData.property}
                    onValueChange={(value) => {
                      setFormData({ ...formData, property: value });
                      setValidationErrors({ ...validationErrors, property: '' });
                    }}
                  >
                    <SelectTrigger className={validationErrors.property ? 'border-red-500' : ''}>
                      <SelectValue placeholder="Select property..." />
                    </SelectTrigger>
                    <SelectContent>
                      {PROPERTIES.map(prop => (
                        <SelectItem key={prop} value={prop}>{prop}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {validationErrors.property && (
                    <p className="text-sm text-red-500 mt-1">{validationErrors.property}</p>
                  )}
                </div>
              </div>

              {/* Unit Type Preference */}
              <div>
                <Label>Unit Type Preference * <span className="text-xs text-muted-foreground">(select all that apply)</span></Label>
                <div className={`flex flex-wrap gap-3 mt-2 p-3 border rounded-md ${validationErrors.unit_type_pref ? 'border-red-500' : ''}`}>
                  {UNIT_TYPES.map(unitType => (
                    <label key={unitType} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.unit_type_pref.includes(unitType)}
                        onChange={(e) => {
                          const updated = e.target.checked
                            ? [...formData.unit_type_pref, unitType]
                            : formData.unit_type_pref.filter(t => t !== unitType);
                          setFormData({ ...formData, unit_type_pref: updated });
                          setValidationErrors({ ...validationErrors, unit_type_pref: '' });
                        }}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span className="text-sm">{unitType}</span>
                    </label>
                  ))}
                </div>
                {validationErrors.unit_type_pref && (
                  <p className="text-sm text-red-500 mt-1">{validationErrors.unit_type_pref}</p>
                )}
              </div>

              {/* Floor Preference & Budget */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Floor Preference</Label>
                  <Select
                    value={formData.floor_pref}
                    onValueChange={(value) => setFormData({ ...formData, floor_pref: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FLOOR_PREFERENCES.map(floor => (
                        <SelectItem key={floor} value={floor}>{floor}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="max_budget">Max Budget ($/month)</Label>
                  <Input
                    id="max_budget"
                    type="number"
                    value={formData.max_budget}
                    onChange={(e) => setFormData({ ...formData, max_budget: e.target.value })}
                    placeholder="2000"
                  />
                </div>
              </div>

              {/* Move-in Date */}
              <div className="space-y-2">
                {useDateRange ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="move_in_date">Earliest Move-in Date *</Label>
                      <Input
                        id="move_in_date"
                        type="date"
                        value={formData.move_in_date}
                        onChange={(e) => {
                          setFormData({ ...formData, move_in_date: e.target.value });
                          setValidationErrors({ ...validationErrors, move_in_date: '' });
                        }}
                        className={validationErrors.move_in_date ? 'border-red-500' : ''}
                      />
                      {validationErrors.move_in_date && (
                        <p className="text-sm text-red-500 mt-1">{validationErrors.move_in_date}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="move_in_date_end">Latest Move-in Date</Label>
                      <Input
                        id="move_in_date_end"
                        type="date"
                        value={formData.move_in_date_end}
                        onChange={(e) => setFormData({ ...formData, move_in_date_end: e.target.value })}
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="move_in_date">Target Move-in Date *</Label>
                    <Input
                      id="move_in_date"
                      type="date"
                      value={formData.move_in_date}
                      onChange={(e) => {
                        setFormData({ ...formData, move_in_date: e.target.value });
                        setValidationErrors({ ...validationErrors, move_in_date: '' });
                      }}
                      className={validationErrors.move_in_date ? 'border-red-500' : ''}
                    />
                    {validationErrors.move_in_date && (
                      <p className="text-sm text-red-500 mt-1">{validationErrors.move_in_date}</p>
                    )}
                  </div>
                )}
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="useDateRange"
                    checked={useDateRange}
                    onChange={(e) => setUseDateRange(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="useDateRange" className="text-sm font-normal cursor-pointer">
                    I have a flexible move-in date range
                  </Label>
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label htmlFor="notes">Additional Notes (optional)</Label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full min-h-[80px] px-3 py-2 border rounded-md text-sm"
                  placeholder="Any specific requirements or preferences..."
                />
              </div>

              {/* Submit */}
              <Button 
                onClick={handleSendVerification} 
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending Verification...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Continue & Verify Email
                  </>
                )}
              </Button>
              
              <p className="text-xs text-muted-foreground text-center">
                We&apos;ll send a verification code to your email to confirm your submission.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Verification Step
  if (step === 'verify') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-8 px-4 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <img src="/highpoint-logo.png" alt="Highpoint Living" className="h-12 w-auto" />
            </div>
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                <Mail className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <CardTitle>Check Your Email</CardTitle>
            <CardDescription>
              We sent a 6-digit verification code to <strong>{formData.email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="code">Verification Code</Label>
              <Input
                id="code"
                value={verificationCode}
                onChange={(e) => {
                  setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  setVerificationError('');
                }}
                placeholder="Enter 6-digit code"
                className={`text-center text-2xl tracking-widest ${verificationError ? 'border-red-500' : ''}`}
                maxLength={6}
              />
              {verificationError && (
                <p className="text-sm text-red-500 mt-1">{verificationError}</p>
              )}
            </div>

            <Button 
              onClick={handleVerifyAndSubmit} 
              className="w-full"
              disabled={isSubmitting || verificationCode.length !== 6}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & Join Waitlist'
              )}
            </Button>

            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Didn&apos;t receive the code?
              </p>
              <Button 
                variant="link" 
                onClick={handleResendCode}
                disabled={isSubmitting}
              >
                Resend Code
              </Button>
              <span className="text-muted-foreground">•</span>
              <Button 
                variant="link" 
                onClick={() => setStep('form')}
                disabled={isSubmitting}
              >
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success Step
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-8 px-4 flex items-center justify-center">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <img src="/highpoint-logo.png" alt="Highpoint Living" className="h-12 w-auto" />
          </div>
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <CardTitle>You&apos;re on the Waitlist!</CardTitle>
          <CardDescription>
            Thank you for joining our waitlist, {formData.full_name.split(' ')[0]}!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Property:</span>
              <span className="font-medium">{formData.property}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unit Type:</span>
              <span className="font-medium">{formData.unit_type_pref.join(', ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Move-in Date:</span>
              <span className="font-medium">
                {new Date(formData.move_in_date).toLocaleDateString()}
                {useDateRange && formData.move_in_date_end && (
                  <> - {new Date(formData.move_in_date_end).toLocaleDateString()}</>
                )}
              </span>
            </div>
          </div>

          <div className="text-center text-sm text-muted-foreground">
            <p>We&apos;ve sent a confirmation email to <strong>{formData.email}</strong></p>
            <p className="mt-2">
              A member of our leasing team will reach out when a matching unit becomes available.
            </p>
          </div>

          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground text-center">
              Questions? Contact our leasing office at <a href="mailto:leasing@hpvgproperties.com" className="text-primary hover:underline">leasing@hpvgproperties.com</a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
