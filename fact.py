def f(n):
    f=1
    for i in range(n,0,-1):
       f*=i
    return f

def Binomial(n, x, p):
    return f(n)/(f(n-x)*f(x)) * p**x * (1-p)**(n-x)

def c(n,r):
    return f(n)/(f(r)*f(n-r))

def p(n,r):
    return f(n)/(f(n-r))

print(c(4,0)*c(3,3)/c(7,3))
print(1/35)