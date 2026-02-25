// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { UserProvider } from '@/providers/UserProvider'

import './styles/app.css'
import { router } from '@/app/router'
import { Providers } from '@/app/Providers'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Providers>
      <UserProvider>
      <RouterProvider router={router} />
      </UserProvider>
    </Providers>
  </React.StrictMode>
)